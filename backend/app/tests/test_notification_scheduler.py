"""Proves the notification-queue scheduler gap is closed.

Before this, email_service.process_notification_queue() existed and worked
correctly but had no caller anywhere in the app — ECO notification rows were
created and queued forever, never delivered. This wires it into
app.main._run_notification_drainer, started from the FastAPI lifespan
(mirrors _run_integration_drainer) and driven by
settings.NOTIFICATION_QUEUE_DRAIN_INTERVAL_SECONDS.
"""

import asyncio

import pytest
from sqlalchemy import select

import app.services.email_service as email_service
from app.core.security import get_password_hash
from app.main import _run_notification_drainer
from app.models.notification_queue import NotificationQueue
from app.models.user import User


@pytest.mark.asyncio
async def test_notification_drainer_sends_queued_email_and_marks_it_sent(
    db_session, test_tenant, tenant_id, monkeypatch
):
    user = User(
        email="notify-me@example.com",
        username="notifyme",
        fullName="Notify Me",
        hashedPassword=get_password_hash("testpass123"),
        isActive=True,
        tenantId=tenant_id,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    nq = NotificationQueue(
        user_id=user.id,
        notification_type="info",
        subject="Something happened",
        body="Details here",
        channel="email",
        tenantId=tenant_id,
    )
    db_session.add(nq)
    await db_session.commit()
    await db_session.refresh(nq)
    assert nq.is_sent is False

    sent_to = []

    async def fake_send_email(to, subject, body, html=None, idempotency_key=None):
        sent_to.append(to)
        return True

    # process_notification_queue calls send_email as a module global, so
    # patching it on the module is picked up without needing real SMTP.
    monkeypatch.setattr(email_service, "send_email", fake_send_email)

    task = asyncio.create_task(_run_notification_drainer(interval=3600))
    for _ in range(50):
        await asyncio.sleep(0.05)
        if sent_to:
            break
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert sent_to == ["notify-me@example.com"]
    await db_session.refresh(nq)
    assert nq.is_sent is True


@pytest.mark.asyncio
async def test_successful_drain_updates_metrics(db_session, monkeypatch):
    """ops-hardening: a successful tick must report through
    app.monitoring.metrics (last-drain timestamp, success flag, drained
    count, and reset consecutive-failure count) — this is the signal
    /api/v1/health/detailed surfaces so a stuck drainer is visible."""
    from app.main import _run_notification_drainer
    from app.monitoring.metrics import metrics
    from app.services import email_service as es

    metrics.notification_queue_consecutive_failures.set(2.0)  # simulate prior failures

    async def fake_process(db, batch_size=50):
        return 7

    monkeypatch.setattr(es, "process_notification_queue", fake_process)

    task = asyncio.create_task(_run_notification_drainer(interval=3600))
    for _ in range(50):
        await asyncio.sleep(0.02)
        if metrics.notification_queue_last_drained_count.get() == 7.0:
            break
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert metrics.notification_queue_last_drain_success.get() == 1.0
    assert metrics.notification_queue_last_drained_count.get() == 7.0
    assert metrics.notification_queue_consecutive_failures.get() == 0.0
    assert metrics.notification_queue_last_drain_timestamp.get() > 0


@pytest.mark.asyncio
async def test_notification_drainer_survives_a_failed_drain(db_session, monkeypatch):
    """A drain that raises must not kill the scheduler task — it logs and
    keeps ticking, same contract as _run_integration_drainer.

    `db_session` isn't used directly, but pulling it in forces the test_engine
    fixture to initialize app.db.session's module-level session maker before
    _run_notification_drainer calls get_session_maker() — without it, the
    drainer would fall back to init_engine() and try to hit the real
    production DATABASE_URI.
    """
    from app.monitoring.metrics import metrics
    from app.services import email_service as es

    metrics.notification_queue_consecutive_failures.set(0.0)

    calls = {"n": 0}

    async def boom(db, batch_size=50):
        calls["n"] += 1
        raise RuntimeError("db exploded")

    monkeypatch.setattr(es, "process_notification_queue", boom)

    task = asyncio.create_task(_run_notification_drainer(interval=0.05))
    for _ in range(50):
        await asyncio.sleep(0.02)
        if calls["n"] >= 2:
            break
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert calls["n"] >= 2, "scheduler must keep ticking after a failed drain"
    # ops-hardening: each failed tick must be counted, not just logged, so
    # health/detailed and /metrics can show the drainer is stuck.
    assert metrics.notification_queue_last_drain_success.get() == 0.0
    assert metrics.notification_queue_consecutive_failures.get() >= 2.0


@pytest.mark.asyncio
async def test_cancel_scheduler_tasks_awaits_all_and_swallows_cancellation():
    """finding: ops-hardening #3 - shutdown used to fire .cancel() at each
    scheduler task and move straight on to engine.dispose() without ever
    awaiting them, so a task could still be mid-flight against the engine
    being disposed, and the loop would warn "Task was destroyed but it is
    pending" on interpreter exit. _cancel_scheduler_tasks() must cancel AND
    await every task so shutdown is provably clean (all tasks done, no
    exception propagates)."""
    import app.main as main_module

    async def spin():
        while True:
            await asyncio.sleep(10)

    tasks = [asyncio.create_task(spin()) for _ in range(4)]
    orig = (
        main_module._backup_task,
        main_module._integration_drain_task,
        main_module._zoho_poll_task,
        main_module._notification_drain_task,
    )
    (
        main_module._backup_task,
        main_module._integration_drain_task,
        main_module._zoho_poll_task,
        main_module._notification_drain_task,
    ) = tasks
    try:
        await main_module._cancel_scheduler_tasks()  # must not raise
    finally:
        (
            main_module._backup_task,
            main_module._integration_drain_task,
            main_module._zoho_poll_task,
            main_module._notification_drain_task,
        ) = orig

    for t in tasks:
        assert t.done()
        assert t.cancelled()

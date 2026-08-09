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
async def test_notification_drainer_survives_a_failed_drain(db_session, monkeypatch):
    """A drain that raises must not kill the scheduler task — it logs and
    keeps ticking, same contract as _run_integration_drainer.

    `db_session` isn't used directly, but pulling it in forces the test_engine
    fixture to initialize app.db.session's module-level session maker before
    _run_notification_drainer calls get_session_maker() — without it, the
    drainer would fall back to init_engine() and try to hit the real
    production DATABASE_URI.
    """
    from app.services import email_service as es

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

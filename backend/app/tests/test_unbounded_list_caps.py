"""The append-only log endpoints must cap their result set — and say so.

Both of these used to SELECT an entire table. `erp_sync_logs` gains a row per
sync run and `bulk_import_jobs` one per import, forever, so on any long-lived
deployment the response grows without bound until the request exhausts memory
and takes the worker down with it. The older the install, the likelier that is.

A cap alone would trade a crash for a wrong answer, so each endpoint reports the
true row count in X-Total-Count. These tests pin both halves: the cap is
enforced, and the count is honest about what was left out.
"""

import pytest

from app.models.bulk_import import BulkImportJob


@pytest.mark.asyncio
async def test_import_jobs_are_capped_and_report_true_total(
    client, db_session, test_user, tenant_id, auth_headers
):
    # More rows than the default page, so a missing LIMIT is visible.
    for i in range(120):
        db_session.add(
            BulkImportJob(
                tenantId=tenant_id,
                filename=f"import-{i}.csv",
                status="completed",
                totalRows=10,
            )
        )
    await db_session.commit()

    resp = await client.get("/api/v1/import/jobs", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert isinstance(body, list), "response shape must stay a bare list"
    assert len(body) == 100, f"default cap of 100 not applied, got {len(body)}"
    assert resp.headers.get("X-Total-Count") == "120", (
        "the cap must be visible: without a truthful total the caller cannot "
        "tell 100 jobs from the first 100 of 120"
    )


@pytest.mark.asyncio
async def test_import_jobs_limit_is_bounded(client, db_session, test_user, tenant_id, auth_headers):
    """A caller must not be able to ask for the unbounded read back."""
    resp = await client.get(
        "/api/v1/import/jobs?limit=100000", headers=auth_headers
    )
    assert resp.status_code == 422, (
        "limit above the ceiling must be rejected, not honoured — otherwise the "
        "cap is advisory and the OOM is one query string away"
    )


@pytest.mark.asyncio
async def test_import_jobs_offset_pages(client, db_session, test_user, tenant_id, auth_headers):
    """Paging must actually move the window, or the cap hides rows for good."""
    for i in range(15):
        db_session.add(
            BulkImportJob(
                tenantId=tenant_id,
                filename=f"page-{i:02d}.csv",
                status="completed",
                totalRows=1,
            )
        )
    await db_session.commit()

    first = await client.get(
        "/api/v1/import/jobs?limit=5&offset=0", headers=auth_headers
    )
    second = await client.get(
        "/api/v1/import/jobs?limit=5&offset=5", headers=auth_headers
    )
    assert first.status_code == second.status_code == 200

    ids_a = {row["id"] for row in first.json()}
    ids_b = {row["id"] for row in second.json()}
    assert len(ids_a) == len(ids_b) == 5
    assert not (ids_a & ids_b), "offset did not advance — both pages returned the same rows"

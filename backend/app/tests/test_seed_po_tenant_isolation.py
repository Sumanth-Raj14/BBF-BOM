"""Regression test for seed_po.py:
  1. tenantId is actually set on inserted POHeader/POLineItem rows (used to
     be omitted entirely -> NOT NULL constraint violation on every insert).
  2. the "clear existing data" delete is scoped to the resolved tenant, not
     just the PO number -- poNumber is only unique per tenant, so another
     tenant's PO with the same number must survive a re-run of this script.
"""

import importlib

import openpyxl
import pytest
from sqlalchemy import select

from app.models.po_models import POHeader
from app.models.tenant import Tenant
from app.tests.conftest import no_tenant_filter


def _write_po_workbook(path, po_number):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Purchase Orders"
    ws.append(
        [
            "Date",
            "PO Number",
            "Vendor",
            "Item",
            "Description",
            "Qty",
            "Price",
            "Amount",
            "GST",
            "Total",
            "PO Total",
            "Project",
            "Status",
        ]
    )
    ws.append(
        [
            "2026-01-01",
            po_number,
            "Acme Vendor",
            "Widget",
            "A widget",
            2,
            10.0,
            20.0,
            2.0,
            22.0,
            22.0,
            "Proj X",
            "Open",
        ]
    )
    wb.save(path)


@pytest.mark.asyncio
async def test_seed_po_sets_tenant_and_does_not_cross_tenant_delete(
    tmp_path, monkeypatch, db_session, test_engine, test_tenant, tenant_id
):
    # Another tenant already owns a PO with the SAME number the fixture
    # workbook below will also use. If seed_po's delete is only scoped by
    # poNumber (the bug), running seed() would wipe this row even though it
    # belongs to a different tenant.
    other_tenant = Tenant(tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other_tenant)
    await db_session.commit()
    await db_session.refresh(other_tenant)

    other_header = POHeader(
        tenantId=other_tenant.id, poNumber="PO-SHARED", vendorName="Other Vendor", status="Open"
    )
    db_session.add(other_header)
    await db_session.commit()
    other_header_id = other_header.id

    xlsx_path = tmp_path / "pos.xlsx"
    _write_po_workbook(xlsx_path, "PO-SHARED")

    # render_as_string(hide_password=False), NOT str(): SQLAlchemy's __str__
    # masks the password as "***", so on the Postgres CI track seed_po would
    # connect with a literal *** and fail with InvalidPasswordError. On SQLite
    # there is no password, which is why this only broke on Postgres.
    monkeypatch.setenv(
        "TEST_DATABASE_URL", test_engine.url.render_as_string(hide_password=False)
    )

    seed_po = importlib.import_module("seed_po")
    importlib.reload(seed_po)
    monkeypatch.setattr(seed_po, "EXCEL_PATH", str(xlsx_path))

    # seed() opens its own engine/session against the resolved test DB (the
    # same sqlite file db_session is using) rather than db_session itself, so
    # it must not raise (Finding 1: used to hit a NOT NULL violation here).
    await seed_po.seed()

    # The other tenant's row must survive untouched. Bypass the ambient
    # tenant-SELECT auto-filter (pinned to `tenant_id` by the autouse
    # setup_tenant_context fixture) -- this assertion is deliberately
    # checking a DB-level fact about a DIFFERENT tenant's row.
    with no_tenant_filter():
        still_there = (
            await db_session.execute(select(POHeader).where(POHeader.id == other_header_id))
        ).scalar_one_or_none()
        assert still_there is not None
        assert still_there.tenantId == other_tenant.id

        # The seeded row for the *resolved* tenant must have a real tenantId
        # set (Finding 1) and must be a separate row from the other tenant's.
        seeded = (
            await db_session.execute(
                select(POHeader).where(
                    POHeader.poNumber == "PO-SHARED", POHeader.id != other_header_id
                )
            )
        ).scalar_one_or_none()
        assert seeded is not None
        assert seeded.tenantId is not None
        assert seeded.tenantId != other_tenant.id

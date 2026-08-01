#!/usr/bin/env python
"""Idempotent supplemental seed: inventory, documents, a full RFQ (header +
line items + supplier responses), supplier users, and a purchase order.

Complements seed_db.py (which seeds parts/vendors/projects/BOMs/admin). Safe to
re-run: every block checks for existing data first and skips if present. All
rows are tenant-scoped to the existing tenant. Run from backend/ with the same
DB env as the app (POSTGRES_*/DATABASE_URL).
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select  # noqa: E402

from app.core.security import get_password_hash  # noqa: E402
from app.db.session import get_session_maker, init_engine  # noqa: E402
from app.models.document import Document  # noqa: E402
from app.models.inventory import Inventory, Warehouse  # noqa: E402
from app.models.part import Part  # noqa: E402
from app.models.po_models import POHeader, POLineItem  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.models.supplier_portal import (  # noqa: E402
    RfqHeader,
    RfqLineItem,
    RfqSupplierResponse,
    SupplierUser,
)
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.vendor import Vendor  # noqa: E402


def _f(obj, *names, default=None):
    for n in names:
        v = getattr(obj, n, None)
        if v is not None:
            return v
    return default


async def main():
    await init_engine()
    Session = await get_session_maker()
    created = {}
    async with Session() as s:
        tenant = await s.scalar(select(Tenant).order_by(Tenant.id))
        if not tenant:
            print("No tenant found — run seed_db.py first.")
            return
        tid = tenant.id
        parts = (await s.scalars(select(Part).where(Part.tenantId == tid).order_by(Part.id))).all()
        vendors = (
            await s.scalars(select(Vendor).where(Vendor.tenantId == tid).order_by(Vendor.id))
        ).all()
        projects = (
            await s.scalars(select(Project).where(Project.tenantId == tid).order_by(Project.id))
        ).all()
        admin = await s.scalar(
            select(User).where(User.tenantId == tid).order_by(User.id)
        )
        if not parts or not vendors or not admin:
            print("Need parts, vendors and a user first — run seed_db.py.")
            return

        # ---- 1. Warehouse + inventory -------------------------------------
        wh = await s.scalar(
            select(Warehouse).where(
                Warehouse.tenantId == tid, Warehouse.warehouse_code == "WH-MAIN"
            )
        )
        if not wh:
            wh = Warehouse(
                tenantId=tid,
                warehouse_code="WH-MAIN",
                warehouse_name="Main Warehouse",
                address="Plant 1, Receiving Dock A",
                is_active=True,
            )
            s.add(wh)
            await s.flush()
            created["warehouse"] = 1
        inv_added = 0
        for i, p in enumerate(parts):
            exists = await s.scalar(
                select(func.count())
                .select_from(Inventory)
                .where(Inventory.part_id == p.id, Inventory.warehouse_id == wh.id)
            )
            if exists:
                continue
            cost = _f(p, "cost", "landedCost", default=10.0)
            s.add(
                Inventory(
                    tenantId=tid,
                    part_id=p.id,
                    warehouse_id=wh.id,
                    lot_number=f"LOT-{2026}{i + 1:03d}",
                    quantity_on_hand=float(50 + i * 25),
                    quantity_reserved=float(i * 5),
                    unit_cost=float(cost),
                    status="available",
                )
            )
            inv_added += 1
        if inv_added:
            created["inventory"] = inv_added

        # ---- 2. Documents -------------------------------------------------
        doc_count = await s.scalar(
            select(func.count()).select_from(Document).where(Document.tenantId == tid)
        )
        if not doc_count:
            samples = [
                ("STM32H7-datasheet.pdf", "Datasheet", "pdf", "datasheet,electrical"),
                ("enclosure-drawing.dwg", "Drawing", "dwg", "mechanical,drawing"),
                ("supplier-quote-Q4.xlsx", "Quote", "xlsx", "procurement,quote"),
                ("RoHS-certificate.pdf", "Compliance", "pdf", "compliance,rohs"),
            ]
            for i, (fn, cat, ext, tags) in enumerate(samples):
                s.add(
                    Document(
                        tenantId=tid,
                        filename=fn,
                        originalName=fn,
                        fileType=ext,
                        fileSize=1024 * (40 + i * 12),
                        category=cat,
                        tags=tags,
                        partId=parts[i % len(parts)].id,
                        projectId=projects[0].id if projects else None,
                        uploadedBy=admin.email,
                        accessLevel="private",
                        storage_type="local",
                        version=1,
                        isLatest=True,
                    )
                )
            created["documents"] = len(samples)

        # ---- 3. Supplier users (one per vendor, up to 3) ------------------
        sup_users = []
        for v in vendors[:3]:
            email = f"contact@{_f(v, 'name', default='vendor').lower().replace(' ', '')}.example.com"
            su = await s.scalar(
                select(SupplierUser).where(
                    SupplierUser.tenantId == tid, SupplierUser.email == email
                )
            )
            if not su:
                su = SupplierUser(
                    tenantId=tid,
                    vendorId=v.id,
                    email=email,
                    name=f"{_f(v, 'name', default='Vendor')} Sales",
                    passwordHash=get_password_hash("Supplier@2026"),
                    active=True,
                )
                s.add(su)
                await s.flush()
                created["supplier_users"] = created.get("supplier_users", 0) + 1
            sup_users.append(su)

        # ---- 4. RFQ (header + line items + supplier responses) ------------
        rfq = await s.scalar(
            select(RfqHeader).where(
                RfqHeader.tenantId == tid, RfqHeader.rfq_number == "RFQ-1001"
            )
        )
        if not rfq:
            rfq = RfqHeader(
                tenantId=tid,
                rfq_number="RFQ-1001",
                title="Q3 Procurement — critical electronics",
                description="Multi-supplier quote request for long-lead components.",
                status="responded",
                created_by=admin.id,
            )
            s.add(rfq)
            await s.flush()
            line_items = []
            for p in parts[:3]:
                li = RfqLineItem(
                    tenantId=tid,
                    rfq_id=rfq.id,
                    part_id=p.id,
                    quantity=100,
                    target_price=float(_f(p, "cost", default=10.0)),
                    notes="Annual volume",
                )
                s.add(li)
                await s.flush()
                line_items.append((li, p))
            # Each supplier quotes each line at a different multiplier so the
            # compare modal shows a real spread (test data, clearly labelled).
            mult = [0.94, 1.03, 0.99]
            resp = 0
            for si, su in enumerate(sup_users):
                for li, p in line_items:
                    base = float(_f(p, "cost", default=10.0))
                    s.add(
                        RfqSupplierResponse(
                            tenantId=tid,
                            rfq_id=rfq.id,
                            supplier_user_id=su.id,
                            line_item_id=li.id,
                            quoted_price=round(base * mult[si % len(mult)], 4),
                            quoted_lead_time_days=21 + si * 7,
                            status="submitted",
                        )
                    )
                    resp += 1
            created["rfq"] = 1
            created["rfq_line_items"] = len(line_items)
            created["rfq_responses"] = resp

        # ---- 5. Purchase order (header + line items) ----------------------
        po = await s.scalar(
            select(POHeader).where(POHeader.tenantId == tid, POHeader.poNumber == "PO-1001")
        )
        if not po:
            v0 = vendors[0]
            po = POHeader(
                tenantId=tid,
                poNumber="PO-1001",
                poDate="2026-07-01",
                vendorName=_f(v0, "name", default="Primary Vendor"),
                project=_f(projects[0], "name", default=None) if projects else None,
                status="Open",
                currency="USD",
                vendor_id=v0.id,
                project_id=projects[0].id if projects else None,
                requested_by=admin.id,
            )
            s.add(po)
            await s.flush()
            total = 0.0
            for p in parts[:3]:
                price = float(_f(p, "cost", default=10.0))
                qty = 25
                amt = price * qty
                total += amt
                s.add(
                    POLineItem(
                        tenantId=tid,
                        headerId=po.id,
                        itemName=_f(p, "name", "pn", default="Item"),
                        itemDesc=_f(p, "description", default=None),
                        partId=p.id,
                        quantity=qty,
                        itemPrice=price,
                        amount=amt,
                        total=amt,
                    )
                )
            po.poTotal = round(total, 2)
            po.subtotal = round(total, 2)
            po.line_count = min(3, len(parts))
            created["purchase_order"] = 1
            created["po_line_items"] = min(3, len(parts))

        await s.commit()

    if created:
        print("Seeded (created):")
        for k, v in created.items():
            print(f"  - {k}: {v}")
    else:
        print("Nothing to seed — all supplemental data already present (idempotent).")


if __name__ == "__main__":
    asyncio.run(main())

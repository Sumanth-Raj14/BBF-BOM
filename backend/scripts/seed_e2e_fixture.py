"""Seed a realistic fixture so end-to-end tests exercise real data paths.

WHY THIS EXISTS
---------------
The E2E suite passed 11/11 while the A1 analytics crash was deliberately
re-introduced, because the database had 0 BOMs: `ctx.rows` was empty, so the
data-shape code path never ran. A suite that only ever sees empty screens
cannot catch data-shape bugs — which is the exact class that broke Analytics,
the BOM diff screen and the folder tree.

This creates a genuine multi-level assembly (root -> sub-assemblies -> leaf
parts) with vendors and costs, so explosion, roll-up, where-used and the
analytics panels all have something to compute.

SAFETY
------
* Everything it creates is prefixed `E2E-`, so it is identifiable and
  removable, and it cannot collide with real records.
* Idempotent: re-running updates/reuses rather than duplicating.
* `--clean` removes exactly what it created and nothing else.
* Targets whatever DATABASE_URL/settings point at. It is a DEV fixture —
  don't run it against production data.

USAGE
    python -m scripts.seed_e2e_fixture            # create/refresh
    python -m scripts.seed_e2e_fixture --clean    # remove
"""

import argparse
import asyncio
import os
import sys

from sqlalchemy import delete, select

from app.core.tenant_context import TenantContext
from app.db.session import get_session_maker
from app.core.security import get_password_hash
from app.models.bom import BOM, BOMItem
from app.models.bom_closure import BomClosure
from app.models.part import Part
from app.models.tenant import Tenant
from app.models.user import User
from app.models.vendor import Vendor
from app.services import bom_service

PREFIX = "E2E-"
BOM_NUMBER = f"{PREFIX}ASSY-001"

# (pn, name, category, cost, vendor_index)
LEAF_PARTS = [
    (f"{PREFIX}RES-10K", "Resistor 10k 0603", "Electrical", 0.012, 0),
    (f"{PREFIX}CAP-100N", "Capacitor 100nF X7R", "Electrical", 0.019, 0),
    (f"{PREFIX}MCU-32", "MCU 32-bit 64LQFP", "Electrical", 4.85, 1),
    (f"{PREFIX}PCB-4L", "PCB 4-layer FR4", "Fabricated", 12.40, 1),
    (f"{PREFIX}SCR-M3", "Screw M3x8 SS", "Hardware", 0.031, 2),
    (f"{PREFIX}HSG-AL", "Housing, anodised AL", "Fabricated", 27.90, 2),
]
SUB_ASSEMBLIES = [
    (f"{PREFIX}SUB-PCBA", "PCBA sub-assembly", [0, 1, 2, 3]),
    (f"{PREFIX}SUB-ENCL", "Enclosure sub-assembly", [4, 5]),
]
ROOT_PART = (f"{PREFIX}TOP-ASSY", "Top-level product assembly", "Assembly", 0.0)
VENDORS = [
    (f"{PREFIX}Passives Direct", "DE", 14),
    (f"{PREFIX}SiliconWorks", "TW", 35),
    (f"{PREFIX}MetalFab Co", "IN", 21),
]


async def ensure_user(email: str, password: str) -> None:
    """Create (or reset) a login the E2E suite can use.

    CI has no seeded account: init_db provisions the schema, not users. Kept
    behind an explicit --with-user flag because it mints an ACTIVE SUPERUSER
    with a known password — never run it against production.
    """
    Session = await get_session_maker()
    async with Session() as db:
        tid = await _tenant_id(db)
        token = TenantContext.set(tenant_id=tid)
        try:
            user = (
                await db.execute(select(User).where(User.email == email))
            ).scalars().first()
            if user is None:
                user = User(
                    email=email,
                    username=email.split("@")[0],
                    fullName="E2E Admin",
                    hashedPassword=get_password_hash(password),
                    isActive=True,
                    isSuperuser=True,
                    tenantId=tid,
                )
                db.add(user)
                action = "created"
            else:
                user.hashedPassword = get_password_hash(password)
                user.isActive = True
                user.failedLoginAttempts = 0
                user.lockedUntil = None
                action = "reset"
            await db.commit()
            print(f"E2E user {action}: {email} (tenant {tid})")
        finally:
            TenantContext.reset(token)


async def _tenant_id(db) -> int:
    tid = (await db.execute(select(Tenant.id).order_by(Tenant.id))).scalars().first()
    if tid is None:
        raise SystemExit("No tenant exists — run scripts.init_db first.")
    return tid


async def _get_or_create_part(db, tid, pn, name, category, cost):
    part = (
        await db.execute(select(Part).where(Part.pn == pn, Part.tenantId == tid))
    ).scalars().first()
    if part:
        part.name, part.category, part.cost = name, category, cost
    else:
        part = Part(pn=pn, name=name, category=category, cost=cost, tenantId=tid)
        db.add(part)
    await db.commit()
    await db.refresh(part)
    return part


async def seed() -> None:
    Session = await get_session_maker()
    async with Session() as db:
        tid = await _tenant_id(db)
        token = TenantContext.set(tenant_id=tid)
        try:
            for name, country, lead in VENDORS:
                existing = (
                    await db.execute(
                        select(Vendor).where(Vendor.name == name, Vendor.tenantId == tid)
                    )
                ).scalars().first()
                if not existing:
                    db.add(
                        Vendor(name=name, country=country, leadTime=lead, tenantId=tid)
                    )
            await db.commit()

            leaves = [
                await _get_or_create_part(db, tid, pn, nm, cat, cost)
                for pn, nm, cat, cost, _v in LEAF_PARTS
            ]
            subs = [
                await _get_or_create_part(db, tid, pn, nm, "Assembly", 0.0)
                for pn, nm, _kids in SUB_ASSEMBLIES
            ]
            root = await _get_or_create_part(db, tid, *ROOT_PART)

            bom = (
                await db.execute(
                    select(BOM).where(BOM.bom_number == BOM_NUMBER, BOM.tenantId == tid)
                )
            ).scalars().first()
            if bom:
                # Rebuild the lines from scratch so re-running is idempotent and
                # the closure table cannot drift.
                await db.execute(delete(BomClosure).where(BomClosure.bom_id == bom.id))
                await db.execute(delete(BOMItem).where(BOMItem.bom_id == bom.id))
                await db.commit()
            else:
                bom = BOM(
                    bom_number=BOM_NUMBER,
                    name="E2E multi-level assembly",
                    tenantId=tid,
                )
                db.add(bom)
                await db.commit()
                await db.refresh(bom)

            # Go through the service, not raw inserts: it maintains bom_closures,
            # which explosion/where-used read.
            root_line = await bom_service.create_bom_item(
                db, bom.id, {"part_id": root.id, "quantity": 1}, tenant_id=tid
            )
            for (pn, _nm, kids), sub_part in zip(SUB_ASSEMBLIES, subs):
                sub_line = await bom_service.create_bom_item(
                    db,
                    bom.id,
                    {
                        "part_id": sub_part.id,
                        "quantity": 2,
                        "parent_item_id": root_line["id"],
                    },
                    tenant_id=tid,
                )
                for idx in kids:
                    await bom_service.create_bom_item(
                        db,
                        bom.id,
                        {
                            "part_id": leaves[idx].id,
                            "quantity": idx + 2,
                            "parent_item_id": sub_line["id"],
                            "unit_cost_snapshot": LEAF_PARTS[idx][3],
                        },
                        tenant_id=tid,
                    )

            depth = len(
                (await db.execute(select(BomClosure).where(BomClosure.bom_id == bom.id)))
                .scalars()
                .all()
            )
            print(
                f"Seeded BOM {BOM_NUMBER} (id={bom.id}): "
                f"{len(leaves)} leaf parts, {len(subs)} sub-assemblies, "
                f"{len(VENDORS)} vendors, {depth} closure rows."
            )
        finally:
            TenantContext.reset(token)


async def clean() -> None:
    Session = await get_session_maker()
    async with Session() as db:
        tid = await _tenant_id(db)
        token = TenantContext.set(tenant_id=tid)
        try:
            bom = (
                await db.execute(
                    select(BOM).where(BOM.bom_number == BOM_NUMBER, BOM.tenantId == tid)
                )
            ).scalars().first()
            if bom:
                await db.execute(delete(BomClosure).where(BomClosure.bom_id == bom.id))
                await db.execute(delete(BOMItem).where(BOMItem.bom_id == bom.id))
                await db.execute(delete(BOM).where(BOM.id == bom.id))
            # Only ever touches the E2E- prefix.
            await db.execute(delete(Part).where(Part.pn.like(f"{PREFIX}%"), Part.tenantId == tid))
            await db.execute(
                delete(Vendor).where(Vendor.name.like(f"{PREFIX}%"), Vendor.tenantId == tid)
            )
            await db.commit()
            print(f"Removed every '{PREFIX}' record for tenant {tid}.")
        finally:
            TenantContext.reset(token)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--clean", action="store_true", help="remove the fixture")
    ap.add_argument(
        "--with-user",
        action="store_true",
        help="also create/reset an active superuser login for the E2E suite "
        "(E2E_EMAIL / E2E_PASSWORD env, defaults admin@blackbox.com/admin123). "
        "Dev and CI only.",
    )
    args = ap.parse_args()
    async def _run():
        if args.clean:
            await clean()
            return
        await seed()
        if args.with_user:
            await ensure_user(
                os.environ.get("E2E_EMAIL", "admin@blackbox.com"),
                os.environ.get("E2E_PASSWORD", "admin123"),
            )

    try:
        asyncio.run(_run())
    except SystemExit as e:
        sys.exit(str(e))

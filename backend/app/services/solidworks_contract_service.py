"""SolidWorks contract service layer.

Business logic backing:
  - Property-mapping CRUD (which SolidWorks custom properties map onto which
    Part fields, and which are explicitly excluded from sync).
  - The `sw_pending_changes` write-back outbox: changes queued to be written
    BACK into SolidWorks, fetched (and marked applied) by a polling plugin.
  - Complex part-number resolution/generation from the tenant's existing
    auto-number-scheme machinery (see app/models/enterprise_extensions.py's
    AutoNumberScheme + app/api/endpoints/enterprise_ext_api.py), with support
    for SW-derived tokens substituted into the scheme's prefix/suffix.

Used by app/api/endpoints/solidworks_contract.py (property mappings + PN
generation) and app/api/endpoints/solidworks_integration.py (the /changes
GET/POST endpoints, which this module turns from stubs into real persistence
against sw_pending_changes).
"""

from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enterprise_extensions import AutoNumberScheme
from app.models.part import Part
from app.models.sw_integration import SwPendingChange, SwPropertyMapping

# ---------------------------------------------------------------------------
# Property mappings
# ---------------------------------------------------------------------------


async def list_property_mappings(db: AsyncSession, tenant_id: int) -> list[SwPropertyMapping]:
    result = await db.execute(
        select(SwPropertyMapping)
        .where(SwPropertyMapping.tenantId == tenant_id)
        .order_by(SwPropertyMapping.sw_property)
    )
    return list(result.scalars().all())


async def set_property_mapping(
    db: AsyncSession,
    tenant_id: int,
    sw_property: str,
    target_field: Optional[str] = None,
    is_excluded: bool = False,
) -> SwPropertyMapping:
    """Create or update the mapping rule for a SolidWorks custom property.

    Upserts on the (tenantId, sw_property) unique key so repeatedly "setting"
    a mapping from the plugin never creates duplicate rows. `target_field` is
    NOT NULL on the table; when excluding a property without naming a target
    field, default it to the property's own name as a placeholder.
    """
    result = await db.execute(
        select(SwPropertyMapping).where(
            SwPropertyMapping.tenantId == tenant_id,
            SwPropertyMapping.sw_property == sw_property,
        )
    )
    mapping = result.scalar_one_or_none()
    if mapping is None:
        mapping = SwPropertyMapping(
            tenantId=tenant_id,
            sw_property=sw_property,
            target_field=target_field or sw_property,
            is_excluded=is_excluded,
        )
        db.add(mapping)
    else:
        if target_field is not None:
            mapping.target_field = target_field
        mapping.is_excluded = is_excluded

    await db.commit()
    await db.refresh(mapping)
    return mapping


async def delete_property_mapping(db: AsyncSession, tenant_id: int, mapping_id: int) -> None:
    result = await db.execute(
        select(SwPropertyMapping).where(
            SwPropertyMapping.id == mapping_id,
            SwPropertyMapping.tenantId == tenant_id,
        )
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Property mapping not found"
        )
    await db.delete(mapping)
    await db.commit()


# ---------------------------------------------------------------------------
# Pending changes (write-back outbox)
# ---------------------------------------------------------------------------


async def add_pending_changes(
    db: AsyncSession,
    tenant_id: int,
    model_name: Optional[str],
    changes: list[dict[str, Any]],
) -> list[SwPendingChange]:
    """Queue changes to be written back into SolidWorks.

    Each change dict is stored verbatim as the row's JSON payload so the
    caller's shape (change_id, property, old/new value, etc.) round-trips
    exactly. When the change carries a `part_number` that resolves to a known
    Part, the row is linked via part_id (nullable — SET NULL on part delete)
    so pending changes can also be queried per-part.
    """
    created: list[SwPendingChange] = []
    for change in changes:
        part_id = None
        part_number = change.get("part_number")
        if part_number:
            presult = await db.execute(
                select(Part).where(Part.tenantId == tenant_id, Part.pn == part_number)
            )
            part = presult.scalar_one_or_none()
            if part:
                part_id = part.id

        row = SwPendingChange(
            tenantId=tenant_id,
            part_id=part_id,
            model_name=model_name,
            change_type=change.get("type") or "property_update",
            payload=change,
            status="pending",
        )
        db.add(row)
        created.append(row)

    await db.commit()
    for row in created:
        await db.refresh(row)
    return created


async def get_pending_changes(
    db: AsyncSession,
    tenant_id: int,
    model_name: Optional[str] = None,
    part_id: Optional[int] = None,
    mark_applied: bool = True,
) -> list[SwPendingChange]:
    """Return queued write-back changes for a model/part.

    By default also marks the returned rows 'applied' (with `applied_at` set)
    so a polling SolidWorks plugin fetches each queued change exactly once.
    """
    query = select(SwPendingChange).where(
        SwPendingChange.tenantId == tenant_id,
        SwPendingChange.status == "pending",
    )
    if model_name:
        query = query.where(SwPendingChange.model_name == model_name)
    if part_id is not None:
        query = query.where(SwPendingChange.part_id == part_id)
    query = query.order_by(SwPendingChange.created_at)

    result = await db.execute(query)
    rows = list(result.scalars().all())

    if mark_applied and rows:
        now = datetime.now(UTC)
        for row in rows:
            row.status = "applied"
            row.applied_at = now
        await db.commit()
        for row in rows:
            await db.refresh(row)

    return rows


# ---------------------------------------------------------------------------
# Complex part-number generation (#11)
# ---------------------------------------------------------------------------


async def generate_part_number(
    db: AsyncSession,
    tenant_id: int,
    entity_type: str,
    inputs: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Resolve/generate a formatted part number from the tenant's active
    auto-number scheme for `entity_type`.

    `inputs` may carry SW-derived tokens (e.g. material/project code) that
    get substituted into the scheme's prefix/suffix via `{token}`
    placeholders — this is what lets a SolidWorks-driven client mint a
    "complex" part number (not just a bare sequence) from the same scheme
    machinery exposed at /enterprise/auto-number-schemes.
    """
    result = await db.execute(
        select(AutoNumberScheme).where(
            AutoNumberScheme.tenantId == tenant_id,
            AutoNumberScheme.entity_type == entity_type,
            AutoNumberScheme.is_active.is_(True),
        )
    )
    scheme = result.scalar_one_or_none()
    if not scheme:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active numbering scheme for entity type: {entity_type}",
        )

    inputs = inputs or {}

    def _fill(template: Optional[str]) -> str:
        if not template:
            return ""
        try:
            return template.format(**inputs)
        except (KeyError, IndexError):
            # Unresolved token (input not supplied) — fall back to the
            # literal template rather than failing the whole generation.
            return template

    next_num = scheme.next_number or 1
    padded = str(next_num).zfill(scheme.padding or 0)
    prefix = _fill(scheme.prefix)
    suffix = _fill(scheme.suffix)
    generated = f"{prefix}{scheme.separator or ''}{padded}{suffix}"

    scheme.next_number = next_num + 1
    await db.commit()

    return {
        "number": generated,
        "entity_type": entity_type,
        "next": scheme.next_number,
    }

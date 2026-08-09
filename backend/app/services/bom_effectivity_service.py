"""BOM line effectivity: resolution ("as of X") + write-time validation.

A BomItem line is effective on at most one axis:
  - date range   (effectiveFrom / effectiveTo)
  - serial range (effectiveSerialFrom / effectiveSerialTo)
  - lot          (effectiveLot, a comma-separated list of lot codes)

All five columns null => the line is always effective (the default for
every pre-existing row, and for any new line that doesn't opt in).

This module is intentionally standalone — it does not import or call
app.services.bom_service, per this wave's ownership split (bom_service.py
belongs to another agent). It operates directly on app.models.bom_item.BomItem
rows, queried by app/api/endpoints/bom_items.py.
"""

from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bom_item import BomItem


def _serial_key(serial: str) -> tuple:
    """Order serials numerically when possible, else lexicographically.

    ponytail: naive two-bucket ordering (numeric-parseable serials always
    sort before non-numeric ones). Fine for the common "SN1001" numeric
    case; upgrade to a real natural-sort/segmented comparator if serials
    mix alpha prefixes with numeric ranges that must interleave.
    """
    try:
        return (0, int(serial))
    except (TypeError, ValueError):
        return (1, serial)


def _serial_in_range(serial: str, lo: Optional[str], hi: Optional[str]) -> bool:
    key = _serial_key(serial)
    if lo is not None and key < _serial_key(lo):
        return False
    if hi is not None and key > _serial_key(hi):
        return False
    return True


def _serial_ranges_overlap(
    a_lo: Optional[str], a_hi: Optional[str], b_lo: Optional[str], b_hi: Optional[str]
) -> bool:
    # Two ranges overlap iff each range's low end is <= the other's high end
    # (open ends treated as -inf/+inf, i.e. no lower/upper bound).
    if a_hi is not None and b_lo is not None and _serial_key(a_hi) < _serial_key(b_lo):
        return False
    if b_hi is not None and a_lo is not None and _serial_key(b_hi) < _serial_key(a_lo):
        return False
    return True


def _date_ranges_overlap(
    a_lo: Optional[date], a_hi: Optional[date], b_lo: Optional[date], b_hi: Optional[date]
) -> bool:
    if a_hi is not None and b_lo is not None and a_hi < b_lo:
        return False
    if b_hi is not None and a_lo is not None and b_hi < a_lo:
        return False
    return True


def _lot_set(lot: Optional[str]) -> set:
    if not lot:
        return set()
    return {x.strip().lower() for x in lot.split(",") if x.strip()}


def validate_effectivity_fields(
    effective_from: Optional[date],
    effective_to: Optional[date],
    effective_serial_from: Optional[str],
    effective_serial_to: Optional[str],
    effective_lot: Optional[str],
) -> None:
    """Raise ValueError on an invalid combination. Pure, no DB access."""
    axes = []

    if effective_from is not None or effective_to is not None:
        axes.append("date")
        if effective_from is not None and effective_to is not None and effective_from > effective_to:
            raise ValueError("effectiveFrom must not be after effectiveTo")

    if effective_serial_from is not None or effective_serial_to is not None:
        axes.append("serial")
        if (
            effective_serial_from is not None
            and effective_serial_to is not None
            and _serial_key(effective_serial_from) > _serial_key(effective_serial_to)
        ):
            raise ValueError("effectiveSerialFrom must not be after effectiveSerialTo")

    if effective_lot is not None and effective_lot.strip() != "":
        axes.append("lot")

    if len(axes) > 1:
        raise ValueError(
            "effectivity must use exactly one of date / serial / lot, got: " + ", ".join(axes)
        )


async def find_overlapping_sibling(
    db: AsyncSession,
    tenant_id: int,
    bom_template_id: int,
    parent_item_id: Optional[int],
    part_id: int,
    exclude_id: Optional[int],
    effective_from: Optional[date],
    effective_to: Optional[date],
    effective_serial_from: Optional[str],
    effective_serial_to: Optional[str],
    effective_lot: Optional[str],
) -> Optional[BomItem]:
    """Reject-on-write policy: two lines for the same part in the same
    parent must not both claim the same point in time / serial / lot —
    otherwise "which revision applies right now" has two answers. Lines on
    different axes (or an unrestricted line) are not compared — combining an
    always-effective baseline with a dated override is a deliberate,
    supported pattern, not a conflict.
    """
    query = select(BomItem).where(
        BomItem.tenantId == tenant_id,
        BomItem.bomTemplateId == bom_template_id,
        BomItem.partId == part_id,
        BomItem.parentItemId == parent_item_id,
    )
    if exclude_id is not None:
        query = query.where(BomItem.id != exclude_id)

    result = await db.execute(query)
    siblings = result.scalars().all()

    has_date = effective_from is not None or effective_to is not None
    has_serial = effective_serial_from is not None or effective_serial_to is not None
    has_lot = bool(effective_lot and effective_lot.strip())

    for sib in siblings:
        if has_date and (sib.effectiveFrom is not None or sib.effectiveTo is not None):
            if _date_ranges_overlap(effective_from, effective_to, sib.effectiveFrom, sib.effectiveTo):
                return sib
        elif has_serial and (
            sib.effectiveSerialFrom is not None or sib.effectiveSerialTo is not None
        ):
            if _serial_ranges_overlap(
                effective_serial_from,
                effective_serial_to,
                sib.effectiveSerialFrom,
                sib.effectiveSerialTo,
            ):
                return sib
        elif has_lot and sib.effectiveLot:
            if _lot_set(effective_lot) & _lot_set(sib.effectiveLot):
                return sib

    return None


def is_effective(
    item: BomItem,
    as_of_date: Optional[date] = None,
    as_of_serial: Optional[str] = None,
    as_of_lot: Optional[str] = None,
) -> bool:
    """The resolver predicate: does `item` apply to the unit being built at
    the given point in time / serial / lot?

    A line restricted on an axis the caller didn't supply a value for is
    excluded (conservative: we can't prove it applies without that context).
    An unrestricted line (no effectivity set at all) always applies.
    """
    has_date = item.effectiveFrom is not None or item.effectiveTo is not None
    has_serial = item.effectiveSerialFrom is not None or item.effectiveSerialTo is not None
    has_lot = bool(item.effectiveLot)

    if not (has_date or has_serial or has_lot):
        return True

    if has_date:
        if as_of_date is None:
            return False
        if item.effectiveFrom is not None and as_of_date < item.effectiveFrom:
            return False
        if item.effectiveTo is not None and as_of_date > item.effectiveTo:
            return False
        return True

    if has_serial:
        if as_of_serial is None:
            return False
        return _serial_in_range(as_of_serial, item.effectiveSerialFrom, item.effectiveSerialTo)

    if has_lot:
        if as_of_lot is None:
            return False
        return as_of_lot.strip().lower() in _lot_set(item.effectiveLot)

    return True  # pragma: no cover - unreachable, kept for clarity


def resolve_effective_items(
    items: list[BomItem],
    as_of_date: Optional[date] = None,
    as_of_serial: Optional[str] = None,
    as_of_lot: Optional[str] = None,
) -> list[BomItem]:
    """Filter a flat list of BomItem rows down to the ones effective at the
    given point. This is the query support for "give me the BOM as of D/S/L".
    """
    return [
        item
        for item in items
        if is_effective(item, as_of_date=as_of_date, as_of_serial=as_of_serial, as_of_lot=as_of_lot)
    ]

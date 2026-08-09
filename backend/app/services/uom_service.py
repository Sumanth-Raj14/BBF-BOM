"""Unit-of-measure conversion service.

Same pattern as the existing exchange-rate conversion in
app/api/endpoints/enterprise_ext_api.py::convert_amount, generalized to
physical units instead of currency: look up a stored factor and multiply.

Hard rule enforced here: a conversion between two DIFFERENT units is either
a real, looked-up number or an explicit error — never a silent 1:1. This
covers both failure modes the feature must refuse quietly-wrong answers on:
  - cross-dimension (metres -> kilograms): always UomConversionError.
  - unrecognised free-text uom (parts.uom is unrestricted free text and
    always has been): always UomConversionError, UNLESS the two sides are
    the literal same string, in which case nothing is actually being
    converted (see convert() below).
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import get_tenant_id
from app.models.uom import UomConversion, UomUnit

# ---------------------------------------------------------------------------
# Standard seed set (also used by alembic/versions/054_uom_conversion.py —
# imported from here so the data lives in exactly one place).
# ---------------------------------------------------------------------------

# (code, name, dimension, is_base)
STANDARD_UNITS: list[tuple[str, str, str, bool]] = [
    ("EA", "Each", "count", True),
    ("M", "Metre", "length", True),
    ("CM", "Centimetre", "length", False),
    ("MM", "Millimetre", "length", False),
    ("FT", "Foot", "length", False),
    ("IN", "Inch", "length", False),
    ("KG", "Kilogram", "mass", True),
    ("G", "Gram", "mass", False),
    ("LB", "Pound", "mass", False),
    ("OZ", "Ounce", "mass", False),
    ("L", "Litre", "volume", True),
    ("ML", "Millilitre", "volume", False),
]

# (from_uom, to_uom [always the dimension's base], factor: 1 from_uom == factor to_uom)
STANDARD_CONVERSIONS: list[tuple[str, str, Decimal]] = [
    ("CM", "M", Decimal("0.01")),
    ("MM", "M", Decimal("0.001")),
    ("FT", "M", Decimal("0.3048")),
    ("IN", "M", Decimal("0.0254")),
    ("G", "KG", Decimal("0.001")),
    ("LB", "KG", Decimal("0.45359237")),
    ("OZ", "KG", Decimal("0.028349523125")),
    ("ML", "L", Decimal("0.001")),
]


class UomConversionError(Exception):
    """A quantity could not be honestly converted between two units.

    `code` distinguishes an unknown unit from a genuine dimension mismatch
    without callers having to pattern-match the message string.
    """

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code  # "unknown_unit" | "cross_dimension"


def _norm(code: Optional[str]) -> str:
    return (code or "").strip().upper()


async def _get_unit(db: AsyncSession, code: str, tenant_id: Optional[int]) -> Optional[UomUnit]:
    stmt = select(UomUnit).where(UomUnit.code == code)
    if tenant_id is not None:
        stmt = stmt.where(UomUnit.tenantId == tenant_id)
    return (await db.execute(stmt)).scalars().first()


async def _factor_to_base(db: AsyncSession, unit: UomUnit, tenant_id: Optional[int]) -> Decimal:
    """Amount of the dimension's base unit equal to 1 of `unit`.

    Joins to UomUnit on to_uom and requires is_base + matching dimension so
    a from_uom with more than one recorded conversion row (the DB only
    enforces uniqueness per (from_uom, to_uom), not per from_uom) can't pick
    the wrong target unit's factor — always the one that actually reaches
    this dimension's base unit.
    """
    if unit.is_base:
        return Decimal(1)
    stmt = (
        select(UomConversion)
        .join(UomUnit, UomUnit.code == UomConversion.to_uom)
        .where(
            UomConversion.from_uom == unit.code,
            UomUnit.dimension == unit.dimension,
            UomUnit.is_base.is_(True),
        )
    )
    if tenant_id is not None:
        stmt = stmt.where(UomConversion.tenantId == tenant_id, UomUnit.tenantId == tenant_id)
    row = (await db.execute(stmt)).scalars().first()
    if row is None:
        # Known unit, but nobody ever recorded how it relates to its base —
        # e.g. a unit added by a tenant with no conversion row. Same honesty
        # rule as an unrecognised unit: refuse rather than guess 1:1.
        raise UomConversionError(
            f"'{unit.code}' has no recorded conversion factor to its base unit — cannot convert.",
            "unknown_unit",
        )
    return Decimal(row.factor)


async def get_unit(db: AsyncSession, code: str, tenant_id: Optional[int] = None) -> Optional[UomUnit]:
    tid = tenant_id if tenant_id is not None else get_tenant_id()
    return await _get_unit(db, _norm(code), tid)


async def list_units(db: AsyncSession, tenant_id: Optional[int] = None) -> list[UomUnit]:
    tid = tenant_id if tenant_id is not None else get_tenant_id()
    stmt = select(UomUnit).where(UomUnit.is_active.is_(True)).order_by(UomUnit.dimension, UomUnit.code)
    if tid is not None:
        stmt = stmt.where(UomUnit.tenantId == tid)
    return list((await db.execute(stmt)).scalars().all())


async def convert(
    db: AsyncSession,
    quantity,
    from_uom: str,
    to_uom: str,
    tenant_id: Optional[int] = None,
) -> Decimal:
    """Convert `quantity` from `from_uom` to `to_uom`.

    Raises UomConversionError (never returns a guessed 1:1 value) when:
      - either unit isn't in uom_units for this tenant ("unknown_unit"), or
      - the two units belong to different dimensions ("cross_dimension").

    The one exception: from_uom == to_uom (after normalizing) always
    returns the input unchanged, even if that string isn't a known unit —
    that's not a conversion, it's the same label on both sides (keeps a
    single BOM line with an unrecognised free-text uom, e.g. "reels", from
    breaking just because nobody registered "reels" as a unit).
    """
    tid = tenant_id if tenant_id is not None else get_tenant_id()
    f, t = _norm(from_uom), _norm(to_uom)
    qty = Decimal(str(quantity))
    if f == t:
        return qty

    from_unit = await _get_unit(db, f, tid)
    to_unit = await _get_unit(db, t, tid)
    if from_unit is None or to_unit is None:
        unknown = f if from_unit is None else t
        raise UomConversionError(
            f"Unrecognized unit of measure '{unknown}' — cannot convert "
            f"between '{from_uom}' and '{to_uom}'.",
            "unknown_unit",
        )
    if from_unit.dimension != to_unit.dimension:
        raise UomConversionError(
            f"Cannot convert '{f}' ({from_unit.dimension}) to '{t}' "
            f"({to_unit.dimension}) — different physical dimensions.",
            "cross_dimension",
        )

    factor_from = await _factor_to_base(db, from_unit, tid)
    factor_to = await _factor_to_base(db, to_unit, tid)
    return qty * factor_from / factor_to


async def try_convert(
    db: AsyncSession,
    quantity,
    from_uom: str,
    to_uom: str,
    tenant_id: Optional[int] = None,
) -> tuple[Optional[Decimal], Optional[str]]:
    """Non-raising convert() for callers (roll-ups) that aggregate many
    lines and need one bad uom to become a reported warning, not a crash.
    Returns (value, None) on success, (None, error_message) on failure.
    """
    try:
        return await convert(db, quantity, from_uom, to_uom, tenant_id), None
    except UomConversionError as e:
        return None, str(e)


@dataclass
class DimensionTotal:
    dimension: str
    base_unit: str
    total: Decimal
    line_count: int


async def _base_unit_for_dimension(
    db: AsyncSession, dimension: str, tenant_id: Optional[int]
) -> Optional[UomUnit]:
    stmt = select(UomUnit).where(UomUnit.dimension == dimension, UomUnit.is_base.is_(True))
    if tenant_id is not None:
        stmt = stmt.where(UomUnit.tenantId == tenant_id)
    return (await db.execute(stmt)).scalars().first()


async def rollup_quantities(
    db: AsyncSession, lines: list[dict], tenant_id: Optional[int] = None
) -> dict:
    """Sum BOM lines (each ``{"quantity": ..., "uom": ...}``) into one total
    per physical dimension, in that dimension's base unit — e.g. a 2 M line
    plus a 150 CM line totals 3.5 M, not two incomparable numbers.

    Lines whose uom isn't a known unit go into `unconverted`, bucketed by
    the raw string, instead of crashing the whole roll-up or being summed
    as if they matched some other unit.

    Available as a cross-part, cross-unit total (all parts pooled by
    dimension). bom_service.get_quantity_rollup needs a PER-PART total
    instead, so it calls try_convert()/extended_cost() directly per line
    rather than this function — see the per-part anchor-unit merge there.
    """
    tid = tenant_id if tenant_id is not None else get_tenant_id()
    by_dimension: dict[str, DimensionTotal] = {}
    unconverted: dict[str, Decimal] = {}

    # ponytail: N+1 fix — a BOM's lines overwhelmingly repeat a handful of
    # uom codes/dimensions, so cache each lookup for the life of this one
    # call instead of re-querying per line. Not a cross-request cache (would
    # go stale the moment units/conversions change), just a local dict.
    unit_cache: dict[str, Optional[UomUnit]] = {}
    factor_cache: dict[str, Decimal] = {}
    base_cache: dict[str, Optional[UomUnit]] = {}

    for line in lines:
        qty = Decimal(str(line.get("quantity") or 0))
        uom = _norm(line.get("uom"))
        unit = None
        if uom:
            if uom not in unit_cache:
                unit_cache[uom] = await _get_unit(db, uom, tid)
            unit = unit_cache[uom]
        if unit is None:
            key = uom or "(none)"
            unconverted[key] = unconverted.get(key, Decimal(0)) + qty
            continue
        if unit.code not in factor_cache:
            factor_cache[unit.code] = await _factor_to_base(db, unit, tid)
        factor = factor_cache[unit.code]
        dim = by_dimension.get(unit.dimension)
        if dim is None:
            if unit.dimension not in base_cache:
                base_cache[unit.dimension] = await _base_unit_for_dimension(db, unit.dimension, tid)
            base_unit = base_cache[unit.dimension]
            dim = DimensionTotal(unit.dimension, base_unit.code if base_unit else unit.code, Decimal(0), 0)
            by_dimension[unit.dimension] = dim
        dim.total += qty * factor
        dim.line_count += 1

    return {
        "by_dimension": [
            {
                "dimension": d.dimension,
                "base_unit": d.base_unit,
                "total": d.total,
                "line_count": d.line_count,
            }
            for d in by_dimension.values()
        ],
        "unconverted": [{"uom": k, "total": v} for k, v in unconverted.items()],
    }


async def extended_cost(
    db: AsyncSession,
    quantity,
    line_uom: Optional[str],
    unit_cost,
    cost_uom: Optional[str],
    tenant_id: Optional[int] = None,
) -> tuple[Decimal, Optional[str]]:
    """extended_cost = quantity (in `line_uom`) converted into `cost_uom`,
    times `unit_cost` (priced per `cost_uom`) — e.g. a part costed per metre
    (cost_uom="M") used on a line counted in centimetres (line_uom="CM").

    Falls back to the naive `quantity * unit_cost` (today's uncorrected
    behaviour, pre-this-feature) with a warning when the units can't be
    reconciled, rather than raising — a cost roll-up must not 500 just
    because one line's uom is unrecognised or the two units are truly
    incompatible; it should say so and keep going.
    """
    qty = Decimal(str(quantity or 0))
    cost = Decimal(str(unit_cost or 0))
    if _norm(line_uom) == _norm(cost_uom):
        return qty * cost, None
    converted, err = await try_convert(db, qty, line_uom, cost_uom, tenant_id)
    if err is not None:
        return qty * cost, (
            f"Could not reconcile line unit '{line_uom or '?'}' with cost unit "
            f"'{cost_uom or '?'}' ({err}); used quantity as-is (unconverted)."
        )
    return converted * cost, None

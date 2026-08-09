"""Tests for multi-UOM conversion (app/services/uom_service.py).

Proves the four required behaviours:
  1. 1 M -> 100 CM (direct unit conversion via the base-unit chain)
  2. M -> KG is refused with a clear cross_dimension error
  3. a BOM mixing M and CM lines rolls up to the correct combined total
  4. an unknown free-text uom neither crashes nor is silently treated 1:1
"""

from decimal import Decimal

import pytest

from app.models.uom import UomConversion, UomUnit
from app.services import uom_service
from app.services.uom_service import STANDARD_CONVERSIONS, STANDARD_UNITS, UomConversionError


@pytest.fixture(autouse=True)
async def seed_units(db_session, test_tenant, tenant_id):
    """conftest's schema comes from Base.metadata.create_all, not alembic,
    so the migration's seed step never runs in tests — seed the same
    standard set directly using the single source of truth."""
    for code, name, dimension, is_base in STANDARD_UNITS:
        db_session.add(
            UomUnit(tenantId=tenant_id, code=code, name=name, dimension=dimension, is_base=is_base)
        )
    await db_session.flush()
    for from_uom, to_uom, factor in STANDARD_CONVERSIONS:
        db_session.add(
            UomConversion(tenantId=tenant_id, from_uom=from_uom, to_uom=to_uom, factor=factor)
        )
    await db_session.commit()


class TestConvert:
    async def test_metre_to_centimetre(self, db_session):
        result = await uom_service.convert(db_session, 1, "M", "CM")
        assert result == Decimal("100")

    async def test_centimetre_to_metre_roundtrip(self, db_session):
        result = await uom_service.convert(db_session, 250, "CM", "M")
        assert result == Decimal("2.5")

    async def test_chained_non_base_pair(self, db_session):
        # Neither CM nor MM is the base unit (M is) — proves the chain
        # through base, not just direct-to-base lookups.
        result = await uom_service.convert(db_session, 5, "CM", "MM")
        assert result == Decimal("50")

    async def test_cross_dimension_refused(self, db_session):
        with pytest.raises(UomConversionError) as exc_info:
            await uom_service.convert(db_session, 1, "M", "KG")
        assert exc_info.value.code == "cross_dimension"

    async def test_unknown_unit_refused_not_silently_1to1(self, db_session):
        with pytest.raises(UomConversionError) as exc_info:
            await uom_service.convert(db_session, 5, "EA", "sprockets")
        assert exc_info.value.code == "unknown_unit"

    async def test_unknown_unit_same_on_both_sides_is_identity(self, db_session):
        # Not a conversion between two different things — same label in and
        # out, so this must NOT raise even though "widgets" isn't registered.
        result = await uom_service.convert(db_session, 7, "widgets", "WIDGETS")
        assert result == Decimal("7")

    async def test_case_insensitive(self, db_session):
        result = await uom_service.convert(db_session, 1, "m", "cm")
        assert result == Decimal("100")


class TestTryConvert:
    async def test_success_returns_value_no_error(self, db_session):
        value, err = await uom_service.try_convert(db_session, 1, "M", "CM")
        assert value == Decimal("100")
        assert err is None

    async def test_failure_returns_none_and_message_not_raise(self, db_session):
        value, err = await uom_service.try_convert(db_session, 1, "M", "KG")
        assert value is None
        assert err is not None
        assert "dimension" in err


class TestRollupQuantities:
    async def test_mixed_m_and_cm_rolls_up_correctly(self, db_session):
        lines = [
            {"quantity": 2, "uom": "M"},
            {"quantity": 150, "uom": "CM"},
        ]
        result = await uom_service.rollup_quantities(db_session, lines)
        length = next(d for d in result["by_dimension"] if d["dimension"] == "length")
        assert length["base_unit"] == "M"
        assert length["total"] == Decimal("3.5")  # 2 M + 1.5 M
        assert length["line_count"] == 2
        assert result["unconverted"] == []

    async def test_unknown_uom_goes_to_unconverted_bucket_not_dropped(self, db_session):
        lines = [
            {"quantity": 2, "uom": "M"},
            {"quantity": 3, "uom": "reels"},
        ]
        result = await uom_service.rollup_quantities(db_session, lines)
        assert result["unconverted"] == [{"uom": "REELS", "total": Decimal("3")}]
        length = next(d for d in result["by_dimension"] if d["dimension"] == "length")
        assert length["total"] == Decimal("2")


class TestFactorToBaseIgnoresWrongToUom:
    """_factor_to_base used to query only on from_uom, trusting the
    docstring convention "one row per non-base unit, straight to its
    dimension's base" — a convention the DB schema does NOT enforce
    (UniqueConstraint is on (tenantId, from_uom, to_uom), so a second row
    for the same from_uom pointing at a different to_uom is legal). If a
    second, non-base-targeting row exists and sorts first, the old code
    silently returned the wrong factor instead of erroring or ignoring it.
    """

    async def test_extra_non_base_conversion_row_does_not_hijack_the_factor(
        self, db_session, tenant_id
    ):
        # Fully custom dimension/units so insertion order is under our own
        # control (SQLite's `.first()` with no ORDER BY tends to return rows
        # in insertion/rowid order, so the WRONG row must be inserted first
        # for a test relying on the pre-fix "whichever comes back first"
        # behaviour to actually exercise it).
        db_session.add_all(
            [
                UomUnit(tenantId=tenant_id, code="BASEU", name="Base", dimension="testdim", is_base=True),
                UomUnit(tenantId=tenant_id, code="OTHERU", name="Other", dimension="testdim", is_base=False),
                UomUnit(tenantId=tenant_id, code="SRCU", name="Src", dimension="testdim", is_base=False),
            ]
        )
        await db_session.flush()
        # WRONG row inserted first: SRCU -> OTHERU (not the dimension's base).
        db_session.add(
            UomConversion(tenantId=tenant_id, from_uom="SRCU", to_uom="OTHERU", factor=Decimal("99"))
        )
        # Correct row: SRCU -> BASEU, inserted second.
        db_session.add(
            UomConversion(tenantId=tenant_id, from_uom="SRCU", to_uom="BASEU", factor=Decimal("3"))
        )
        await db_session.commit()

        # 1 SRCU == 3 BASEU (the correct row), so 2 SRCU == 6 BASEU.
        result = await uom_service.convert(db_session, 2, "SRCU", "BASEU")
        assert result == Decimal("6")


class TestExtendedCost:
    async def test_same_unit_no_conversion_needed(self, db_session):
        cost, warning = await uom_service.extended_cost(db_session, 10, "EA", 2.5, "EA")
        assert cost == Decimal("25.0")
        assert warning is None

    async def test_different_unit_same_dimension_converts(self, db_session):
        # part costed per metre, BOM line counted in centimetres
        cost, warning = await uom_service.extended_cost(db_session, 250, "CM", 4, "M")
        assert cost == Decimal("10")  # 250 CM = 2.5 M; 2.5 * 4 = 10
        assert warning is None

    async def test_unresolvable_units_fall_back_with_warning_not_crash(self, db_session):
        cost, warning = await uom_service.extended_cost(db_session, 10, "EA", 5, "KG")
        assert cost == Decimal("50")  # naive fallback: 10 * 5, unconverted
        assert warning is not None

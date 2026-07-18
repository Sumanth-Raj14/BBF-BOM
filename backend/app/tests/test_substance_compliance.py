"""TDD for the RoHS/REACH substance-compliance compute layer + API.

Covers (per the transformation-progress task brief):
  (a) a part with a RoHS-restricted substance over threshold -> NON_COMPLIANT;
      under threshold, or covered by a valid exemption -> COMPLIANT / EXEMPT.
  (b) a REACH SVHC substance over 0.1% surfaces in the part's result.
  (c) a multi-level BOM rolls up NON_COMPLIANT if any descendant part is,
      and unions SVHC substances across the tree.
  (d) tenant-scoped — no cross-tenant leakage on parts/composition/compliance.
"""

from datetime import date, timedelta

import pytest
import pytest_asyncio

from sqlalchemy import select

from app.core.tenant_context import TenantContext
from app.models.bom import BOM, BOMItem
from app.models.compliance_evaluation import ComplianceEvaluation, ReachObligation
from app.models.part import Part
from app.models.part_composition import ExemptionClaim
from app.models.substance import (
    RegulationVersion,
    RestrictedSubstanceEntry,
    RohsExemption,
    Substance,
)
from app.models.tenant import Tenant
from app.services import substance_compliance_service as svc


# ---------------------------------------------------------------------------
# Reference data fixtures (self-contained — no dependency on the bundled
# reference-data JSON, so these tests do not need reference_seed.py).
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def reg_data(db_session):
    rohs_version = RegulationVersion(
        regulation_code="ROHS3", version_label="TEST-1", source="BUNDLED", is_current=True
    )
    svhc_version = RegulationVersion(
        regulation_code="REACH_SVHC", version_label="TEST-1", source="BUNDLED", is_current=True
    )
    db_session.add_all([rohs_version, svhc_version])
    await db_session.commit()
    await db_session.refresh(rohs_version)
    await db_session.refresh(svhc_version)

    lead = Substance(cas_number="7439-92-1", name="Lead")
    dehp = Substance(cas_number="117-81-7", name="DEHP")
    db_session.add_all([lead, dehp])
    await db_session.commit()
    await db_session.refresh(lead)
    await db_session.refresh(dehp)

    lead_entry = RestrictedSubstanceEntry(
        regulation_version_id=rohs_version.id,
        substance_id=lead.id,
        threshold_ppm=1000,
        threshold_basis="HOMOGENEOUS_MATERIAL",
    )
    dehp_svhc_entry = RestrictedSubstanceEntry(
        regulation_version_id=svhc_version.id,
        substance_id=dehp.id,
        threshold_ppm=1000,  # 0.1%
        threshold_basis="ARTICLE",
    )
    db_session.add_all([lead_entry, dehp_svhc_entry])
    await db_session.commit()

    catalog_exemption = RohsExemption(
        code="TEST-6(c)",
        annex="ANNEX_III",
        substance_id=lead.id,
        applicable_eee_categories=[8],
        valid_until=date.today() + timedelta(days=365),
        status="ACTIVE",
    )
    db_session.add(catalog_exemption)
    await db_session.commit()
    await db_session.refresh(catalog_exemption)

    return {
        "rohs_version": rohs_version,
        "svhc_version": svhc_version,
        "lead": lead,
        "dehp": dehp,
        "catalog_exemption": catalog_exemption,
    }


@pytest_asyncio.fixture
async def part_factory(db_session, test_tenant):
    counter = {"n": 0}

    async def _make(**kwargs):
        counter["n"] += 1
        defaults = dict(
            pn=f"PN-{counter['n']:04d}",
            name="Test Part",
            category="Electrical",
            part_kind="PURCHASED",
            is_article=True,
        )
        defaults.update(kwargs)
        part = Part(**defaults)
        db_session.add(part)
        await db_session.commit()
        await db_session.refresh(part)
        return part

    return _make


# ---------------------------------------------------------------------------
# (a) RoHS threshold + exemptions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_part_over_threshold_is_non_compliant(db_session, test_tenant, reg_data, part_factory):
    part = await part_factory()
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 5000})

    result = await svc.evaluate_part_compliance(db_session, part.id)

    assert result["rohs_status"] == "non_compliant"
    assert result["part_id"] == part.id


@pytest.mark.asyncio
async def test_part_under_threshold_is_compliant(db_session, test_tenant, reg_data, part_factory):
    part = await part_factory()
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 50})

    result = await svc.evaluate_part_compliance(db_session, part.id)

    assert result["rohs_status"] == "compliant"


@pytest.mark.asyncio
async def test_part_with_no_declared_composition_is_unknown(db_session, test_tenant, reg_data, part_factory):
    part = await part_factory()

    result = await svc.evaluate_part_compliance(db_session, part.id)

    assert result["rohs_status"] == "unknown"


@pytest.mark.asyncio
async def test_manual_exemption_toggle_covers_exceedance(
    db_session, test_tenant, reg_data, part_factory
):
    part = await part_factory()
    row = await svc.add_part_composition(
        db_session, part.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 5000}
    )

    # Before marking exempt: NON_COMPLIANT.
    pre = await svc.evaluate_part_compliance(db_session, part.id)
    assert pre["rohs_status"] == "non_compliant"

    updated = await svc.update_part_composition(
        db_session, part.id, row["id"], {"is_exempt": True, "notes": "Field-serviceable per 6(c)"}
    )
    assert updated["is_exempt"] is True
    assert updated["notes"] == "Field-serviceable per 6(c)"

    post = await svc.evaluate_part_compliance(db_session, part.id)
    assert post["rohs_status"] == "exempt"

    # Toggling back off restores NON_COMPLIANT.
    reverted = await svc.update_part_composition(db_session, part.id, row["id"], {"is_exempt": False})
    assert reverted["is_exempt"] is False
    post2 = await svc.evaluate_part_compliance(db_session, part.id)
    assert post2["rohs_status"] == "non_compliant"


@pytest.mark.asyncio
async def test_catalog_exemption_claim_covers_matching_category(
    db_session, test_tenant, reg_data, part_factory
):
    part = await part_factory(eee_category=8)
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 5000})

    claim = ExemptionClaim(
        part_id=part.id,
        exemption_id=reg_data["catalog_exemption"].id,
        substance_id=reg_data["lead"].id,
        justification="Medical device category 8 exemption",
    )
    db_session.add(claim)
    await db_session.commit()

    result = await svc.evaluate_part_compliance(db_session, part.id)
    assert result["rohs_status"] == "exempt"


@pytest.mark.asyncio
async def test_catalog_exemption_claim_does_not_cover_mismatched_category(
    db_session, test_tenant, reg_data, part_factory
):
    # Exemption is scoped to category 8; this part is category 3 -> not covered.
    part = await part_factory(eee_category=3)
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 5000})

    claim = ExemptionClaim(
        part_id=part.id,
        exemption_id=reg_data["catalog_exemption"].id,
        substance_id=reg_data["lead"].id,
        justification="Attempted claim for wrong category",
    )
    db_session.add(claim)
    await db_session.commit()

    result = await svc.evaluate_part_compliance(db_session, part.id)
    assert result["rohs_status"] == "non_compliant"


# ---------------------------------------------------------------------------
# (b) REACH SVHC surfacing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_svhc_over_threshold_surfaces_in_part_result(
    db_session, test_tenant, reg_data, part_factory
):
    part = await part_factory()
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["dehp"].id, "mass_ppm": 2000})

    result = await svc.evaluate_part_compliance(db_session, part.id)

    svhc_ids = [s["id"] for s in result["svhc_substances"]]
    assert reg_data["dehp"].id in svhc_ids
    # SVHC presence does not, by itself, drive the RoHS lattice (DEHP has no
    # ROHS3 restricted-substance entry in this fixture set).
    assert result["rohs_status"] == "compliant"


@pytest.mark.asyncio
async def test_evaluation_persists_to_compliance_evaluations_and_reach_obligations(
    db_session, test_tenant, reg_data, part_factory
):
    part = await part_factory()
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 5000})
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["dehp"].id, "mass_ppm": 2000})

    await svc.evaluate_part_compliance(db_session, part.id)

    eval_row = (
        await db_session.execute(
            select(ComplianceEvaluation).where(
                ComplianceEvaluation.part_id == part.id,
                ComplianceEvaluation.regulation_version_id == reg_data["rohs_version"].id,
                ComplianceEvaluation.basis == "SELF",
            )
        )
    ).scalar_one_or_none()
    assert eval_row is not None
    assert eval_row.status == "NON_COMPLIANT"
    assert eval_row.tenantId == test_tenant.id

    obligation = (
        await db_session.execute(
            select(ReachObligation).where(
                ReachObligation.part_id == part.id,
                ReachObligation.substance_id == reg_data["dehp"].id,
                ReachObligation.regulation_version_id == reg_data["svhc_version"].id,
            )
        )
    ).scalar_one_or_none()
    assert obligation is not None
    assert float(obligation.concentration_ppm) == 2000.0
    assert obligation.tenantId == test_tenant.id

    # Re-evaluating upserts rather than duplicating (partial-unique index).
    await svc.evaluate_part_compliance(db_session, part.id)
    count = (
        await db_session.execute(
            select(ReachObligation).where(
                ReachObligation.part_id == part.id, ReachObligation.substance_id == reg_data["dehp"].id
            )
        )
    ).scalars().all()
    assert len(count) == 1


@pytest.mark.asyncio
async def test_svhc_under_threshold_does_not_surface(db_session, test_tenant, reg_data, part_factory):
    part = await part_factory()
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["dehp"].id, "mass_ppm": 10})

    result = await svc.evaluate_part_compliance(db_session, part.id)

    assert result["svhc_substances"] == []


# ---------------------------------------------------------------------------
# (c) Multi-level BOM rollup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bom_rollup_non_compliant_if_any_descendant_is_and_unions_svhc(
    db_session, test_tenant, reg_data, part_factory
):
    top = await part_factory(pn="ASM-TOP", assembly=True, part_kind="ASSEMBLY", is_article=False)
    sub = await part_factory(pn="ASM-SUB", assembly=True, part_kind="ASSEMBLY", is_article=False)
    leaf_bad = await part_factory(pn="LEAF-BAD")
    leaf_good = await part_factory(pn="LEAF-GOOD")
    leaf_svhc = await part_factory(pn="LEAF-SVHC")

    await svc.add_part_composition(db_session, leaf_bad.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 5000})
    await svc.add_part_composition(db_session, leaf_good.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 10})
    await svc.add_part_composition(db_session, leaf_svhc.id, {"substance_id": reg_data["dehp"].id, "mass_ppm": 2000})

    bom = BOM(bom_number="BOM-ROLLUP-1", name="Rollup Test BOM")
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)

    top_item = BOMItem(bom_id=bom.id, part_id=top.id, quantity=1)
    db_session.add(top_item)
    await db_session.commit()
    await db_session.refresh(top_item)

    sub_item = BOMItem(bom_id=bom.id, part_id=sub.id, quantity=2, parent_item_id=top_item.id)
    db_session.add(sub_item)
    await db_session.commit()
    await db_session.refresh(sub_item)

    leaf_items = [
        BOMItem(bom_id=bom.id, part_id=leaf_bad.id, quantity=1, parent_item_id=sub_item.id),
        BOMItem(bom_id=bom.id, part_id=leaf_good.id, quantity=4, parent_item_id=sub_item.id),
        BOMItem(bom_id=bom.id, part_id=leaf_svhc.id, quantity=1, parent_item_id=top_item.id),
    ]
    db_session.add_all(leaf_items)
    await db_session.commit()

    report = await svc.evaluate_bom_compliance(db_session, bom.id)

    assert report["rohs_status"] == "non_compliant"
    part_status = {p["part_id"]: p["rohs_status"] for p in report["parts"]}
    assert part_status[leaf_bad.id] == "non_compliant"
    assert part_status[leaf_good.id] == "compliant"
    # top/sub assemblies have no declared composition of their own -> unknown,
    # but that must not mask the leaf's own non_compliant row in the flat list.
    assert part_status[top.id] == "unknown"

    svhc_ids = {s["id"] for s in report["svhc_substances"]}
    assert reg_data["dehp"].id in svhc_ids


# ---------------------------------------------------------------------------
# (d) Tenant isolation
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def second_tenant(db_session):
    tenant = Tenant(id=2, tenant_name="Second Tenant", tenant_code="TEST2")
    db_session.add(tenant)
    await db_session.commit()
    return tenant


@pytest.mark.asyncio
async def test_part_composition_and_compliance_are_tenant_isolated(
    db_session, test_tenant, second_tenant, reg_data, part_factory
):
    part = await part_factory()
    await svc.add_part_composition(db_session, part.id, {"substance_id": reg_data["lead"].id, "mass_ppm": 5000})

    token = TenantContext.set(tenant_id=second_tenant.id)
    try:
        with pytest.raises(Exception) as exc_info:
            await svc.evaluate_part_compliance(db_session, part.id)
        assert getattr(exc_info.value, "status_code", None) == 404

        with pytest.raises(Exception) as exc_info2:
            await svc.list_part_composition(db_session, part.id)
        assert getattr(exc_info2.value, "status_code", None) == 404
    finally:
        TenantContext.reset(token)

    # Back on tenant 1, the part and its composition are still there and unaffected.
    back = await svc.evaluate_part_compliance(db_session, part.id)
    assert back["rohs_status"] == "non_compliant"


@pytest.mark.asyncio
async def test_bom_compliance_is_tenant_isolated(
    db_session, test_tenant, second_tenant, reg_data, part_factory
):
    part = await part_factory()
    bom = BOM(bom_number="BOM-TENANT-1", name="Tenant 1 BOM")
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)
    item = BOMItem(bom_id=bom.id, part_id=part.id, quantity=1)
    db_session.add(item)
    await db_session.commit()

    token = TenantContext.set(tenant_id=second_tenant.id)
    try:
        with pytest.raises(Exception) as exc_info:
            await svc.evaluate_bom_compliance(db_session, bom.id)
        assert getattr(exc_info.value, "status_code", None) == 404
    finally:
        TenantContext.reset(token)

"""RoHS/REACH substance-compliance compute layer.

Wires the substance catalog (``app/models/substance.py``, GLOBAL) and the
tenant-owned composition/declaration/exemption tables
(``app/models/part_composition.py``) into the two derived views the existing
frontend (``frontend/api.js`` -> ``substanceComplianceAPI``,
``PartComplianceTab.jsx``, ``ComplianceReportPanel.jsx``) already expects:

  * a part's own RoHS status + SVHC substances present (``evaluate_part_compliance``)
  * a BOM-wide rollup of the same, unioned across every part in the tree
    (``evaluate_bom_compliance``)

Design notes (no new migration — reuses migrations 042/043/044 verbatim):

* The frontend's composition row is a FLAT (substance_id, mass_ppm, is_exempt,
  notes) tuple per part — there is no per-homogeneous-material breakdown in
  the UI. Since ``part_material_substances`` hangs off ``part_materials``
  (the RoHS homogeneous-material denominator), every part gets ONE lazily
  created "whole part" default material (``_DEFAULT_MATERIAL_NAME``) that all
  of its composition rows attach to. This satisfies the ``ck_part_materials_mass_present``
  CHECK (mass_fraction=1) without requiring the UI to model materials.
* The composition row's manual ``is_exempt`` toggle (a boolean switch, not a
  catalog exemption picker) is backed by a real ``ExemptionClaim`` against a
  lazily get-or-created, GLOBAL "MANUAL-OVERRIDE" ``RohsExemption`` catalog
  row (status ACTIVE, no category/expiry restriction) — so it participates in
  the same exemption-matching logic as a catalog exemption (spec P16) rather
  than being untracked, undeclared UI-only state. ``notes`` is populated from
  the claim's ``justification`` (server-computed / optional; the existing UI
  never sends it back on write).
* Evaluation matches the CURRENT ``RegulationVersion`` (is_current=True) for
  ROHS3 and REACH_SVHC, honoring ``RohsExemption`` via ``ExemptionClaim``
  (substance OR its group; ``applicable_eee_categories`` + ``valid_until`` /
  ``category_validity``). A part's own ``eee_category`` may be NULL (spec P3
  — it is meaningful mainly on top-level assemblies and inherited at rollup);
  when NULL, exemption category-scoping is not evaluated against it (benefit
  of the doubt) rather than incorrectly rejecting the exemption.
* When called with ``persist=True`` (the default on the service functions,
  but NOT what the read-only GET endpoints pass — see
  ``substance_compliance_api.py``), persists a SELF ``ComplianceEvaluation``
  row per (tenant, part, regulation_version) on every part evaluation, and
  additionally a ROLLUP row per (tenant, part, regulation_version, bom)
  whenever that part is evaluated in a BOM context — both upserted against
  the partial-unique indexes defined on migration 044. Per the
  ``compliance_evaluation.py`` model docstring, REACH Art. 33/SCIP
  obligations union upward independent of the RoHS status lattice, so each
  SVHC substance found over threshold is additionally upserted into
  ``reach_obligations`` (part_id == article_part_id at this part-evaluation
  granularity — carrier/leaf distinction across the tree is out of scope
  here since the UI only needs the flat per-part + BOM-union view, not a
  per-carrier obligation ledger). The two GET endpoints (part compliance,
  BOM compliance) always call with ``persist=False``: a GET must be
  side-effect-free and must never write, so it can never race a concurrent
  identical GET into an ``IntegrityError``/500 on the SELF/ROLLUP
  partial-unique index. The upsert helpers (``_upsert_evaluation`` /
  ``_upsert_reach_obligation``) are additionally race-safe in their own
  right — a lost SELECT-then-INSERT race against a concurrent
  ``persist=True`` writer is caught and reconciled via re-select rather than
  bubbling an ``IntegrityError`` — for any future non-GET caller.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import get_tenant_id
from app.models.bom import BOM, BOMItem
from app.models.compliance_evaluation import ComplianceEvaluation, ReachObligation
from app.models.part import Part
from app.models.part_composition import ExemptionClaim, PartMaterial, PartMaterialSubstance
from app.models.substance import (
    RegulationVersion,
    RestrictedSubstanceEntry,
    RohsExemption,
    Substance,
    SubstanceGroup,
)

_DEFAULT_MATERIAL_NAME = "Whole Part (default)"
_MANUAL_EXEMPTION_CODE = "MANUAL-OVERRIDE"
_STATUS_PRIORITY = ["NON_COMPLIANT", "UNKNOWN", "EXEMPT", "COMPLIANT"]


# =====================================================================
# Substance catalog (Substance / SubstanceGroup) — GLOBAL reference data
# =====================================================================


async def _svhc_substance_and_group_ids(db: AsyncSession) -> tuple[set[int], set[int]]:
    ver_stmt = select(RegulationVersion).where(
        RegulationVersion.regulation_code == "REACH_SVHC",
        RegulationVersion.is_current.is_(True),
    )
    version = (await db.execute(ver_stmt)).scalar_one_or_none()
    if version is None:
        return set(), set()
    entries = (
        await db.execute(
            select(RestrictedSubstanceEntry).where(
                RestrictedSubstanceEntry.regulation_version_id == version.id
            )
        )
    ).scalars().all()
    sub_ids = {e.substance_id for e in entries if e.substance_id is not None}
    grp_ids = {e.substance_group_id for e in entries if e.substance_group_id is not None}
    return sub_ids, grp_ids


def _substance_to_dict(s: Substance, svhc_sub_ids: set[int], svhc_grp_ids: set[int]) -> dict:
    is_svhc = s.id in svhc_sub_ids or (
        s.substance_group_id is not None and s.substance_group_id in svhc_grp_ids
    )
    return {
        "id": s.id,
        "cas_number": s.cas_number,
        "ec_number": s.ec_number,
        "name": s.name,
        "substance_group_id": s.substance_group_id,
        "is_svhc": is_svhc,
    }


async def list_substances(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(Substance).order_by(Substance.name))).scalars().all()
    svhc_sub_ids, svhc_grp_ids = await _svhc_substance_and_group_ids(db)
    return [_substance_to_dict(s, svhc_sub_ids, svhc_grp_ids) for s in rows]


async def _get_substance_or_404(db: AsyncSession, substance_id: int) -> Substance:
    s = (
        await db.execute(select(Substance).where(Substance.id == substance_id))
    ).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Substance not found")
    return s


async def get_substance(db: AsyncSession, substance_id: int) -> dict:
    s = await _get_substance_or_404(db, substance_id)
    svhc_sub_ids, svhc_grp_ids = await _svhc_substance_and_group_ids(db)
    return _substance_to_dict(s, svhc_sub_ids, svhc_grp_ids)


async def create_substance(db: AsyncSession, data: dict) -> dict:
    cas_number = data.get("cas_number")
    existing = (
        await db.execute(select(Substance).where(Substance.cas_number == cas_number))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=409, detail=f"A substance with CAS number {cas_number} already exists"
        )
    if data.get("substance_group_id") is not None:
        grp = (
            await db.execute(
                select(SubstanceGroup).where(SubstanceGroup.id == data["substance_group_id"])
            )
        ).scalar_one_or_none()
        if grp is None:
            raise HTTPException(status_code=404, detail="Substance group not found")
    s = Substance(
        cas_number=cas_number,
        ec_number=data.get("ec_number"),
        name=data["name"],
        substance_group_id=data.get("substance_group_id"),
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    svhc_sub_ids, svhc_grp_ids = await _svhc_substance_and_group_ids(db)
    return _substance_to_dict(s, svhc_sub_ids, svhc_grp_ids)


async def update_substance(db: AsyncSession, substance_id: int, data: dict) -> dict:
    s = await _get_substance_or_404(db, substance_id)
    if "cas_number" in data and data["cas_number"] != s.cas_number:
        clash = (
            await db.execute(select(Substance).where(Substance.cas_number == data["cas_number"]))
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(
                status_code=409,
                detail=f"A substance with CAS number {data['cas_number']} already exists",
            )
    for field in ("cas_number", "ec_number", "name", "substance_group_id"):
        if field in data:
            setattr(s, field, data[field])
    await db.commit()
    await db.refresh(s)
    svhc_sub_ids, svhc_grp_ids = await _svhc_substance_and_group_ids(db)
    return _substance_to_dict(s, svhc_sub_ids, svhc_grp_ids)


async def delete_substance(db: AsyncSession, substance_id: int) -> None:
    s = await _get_substance_or_404(db, substance_id)
    await db.delete(s)
    await db.commit()


# =====================================================================
# Part composition CRUD (tenant-scoped)
# =====================================================================


async def _get_part_or_404(db: AsyncSession, part_id: int) -> Part:
    tid = get_tenant_id()
    stmt = select(Part).where(Part.id == part_id)
    if tid is not None:
        stmt = stmt.where(Part.tenantId == tid)
    part = (await db.execute(stmt)).scalar_one_or_none()
    if part is None:
        raise HTTPException(status_code=404, detail="Part not found")
    return part


async def _get_or_create_default_material(db: AsyncSession, part_id: int) -> PartMaterial:
    tid = get_tenant_id()
    stmt = select(PartMaterial).where(
        PartMaterial.part_id == part_id, PartMaterial.name == _DEFAULT_MATERIAL_NAME
    )
    if tid is not None:
        stmt = stmt.where(PartMaterial.tenantId == tid)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        return existing
    pm = PartMaterial(part_id=part_id, name=_DEFAULT_MATERIAL_NAME, mass_fraction=1)
    db.add(pm)
    await db.flush()
    return pm


async def _get_or_create_manual_exemption(db: AsyncSession) -> RohsExemption:
    existing = (
        await db.execute(select(RohsExemption).where(RohsExemption.code == _MANUAL_EXEMPTION_CODE))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    ex = RohsExemption(
        code=_MANUAL_EXEMPTION_CODE,
        annex="ANNEX_III",
        application_scope=(
            "Manually asserted exemption recorded from the part-composition UI "
            "(not a specific Annex III/IV catalog exemption); no category/expiry "
            "restriction — requires engineering justification and periodic review."
        ),
        applicable_eee_categories=None,
        valid_until=None,
        category_validity=None,
        status="ACTIVE",
    )
    db.add(ex)
    await db.flush()
    return ex


async def _get_claims_for_part(db: AsyncSession, part_id: int) -> list[ExemptionClaim]:
    tid = get_tenant_id()
    stmt = select(ExemptionClaim).where(ExemptionClaim.part_id == part_id)
    if tid is not None:
        stmt = stmt.where(ExemptionClaim.tenantId == tid)
    return (await db.execute(stmt)).scalars().all()


async def _get_composition_row_or_404(
    db: AsyncSession, part_id: int, row_id: int
) -> PartMaterialSubstance:
    tid = get_tenant_id()
    stmt = (
        select(PartMaterialSubstance)
        .join(PartMaterial, PartMaterialSubstance.part_material_id == PartMaterial.id)
        .where(PartMaterialSubstance.id == row_id, PartMaterial.part_id == part_id)
    )
    if tid is not None:
        stmt = stmt.where(PartMaterialSubstance.tenantId == tid, PartMaterial.tenantId == tid)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Composition entry not found")
    return row


def _composition_row_to_dict(row: PartMaterialSubstance, claims_by_substance: dict) -> dict:
    claim = claims_by_substance.get(row.substance_id)
    return {
        "id": row.id,
        "substance_id": row.substance_id,
        "mass_ppm": float(row.concentration_ppm) if row.concentration_ppm is not None else 0.0,
        "is_exempt": claim is not None,
        "notes": claim.justification if claim is not None else None,
    }


async def _claims_by_substance(db: AsyncSession, part_id: int) -> dict:
    claims = await _get_claims_for_part(db, part_id)
    out: dict[int, ExemptionClaim] = {}
    for c in claims:
        if c.substance_id is not None:
            out[c.substance_id] = c
    return out


async def list_part_composition(db: AsyncSession, part_id: int) -> list[dict]:
    await _get_part_or_404(db, part_id)
    tid = get_tenant_id()
    stmt = (
        select(PartMaterialSubstance)
        .join(PartMaterial, PartMaterialSubstance.part_material_id == PartMaterial.id)
        .where(PartMaterial.part_id == part_id)
    )
    if tid is not None:
        stmt = stmt.where(PartMaterialSubstance.tenantId == tid, PartMaterial.tenantId == tid)
    rows = (await db.execute(stmt)).scalars().all()
    claims = await _claims_by_substance(db, part_id)
    return [_composition_row_to_dict(r, claims) for r in rows]


async def add_part_composition(db: AsyncSession, part_id: int, data: dict) -> dict:
    await _get_part_or_404(db, part_id)
    substance_id = data["substance_id"]
    substance = (
        await db.execute(select(Substance).where(Substance.id == substance_id))
    ).scalar_one_or_none()
    if substance is None:
        raise HTTPException(status_code=404, detail="Substance not found")

    material = await _get_or_create_default_material(db, part_id)

    tid = get_tenant_id()
    dup_stmt = select(PartMaterialSubstance).where(
        PartMaterialSubstance.part_material_id == material.id,
        PartMaterialSubstance.substance_id == substance_id,
    )
    if tid is not None:
        dup_stmt = dup_stmt.where(PartMaterialSubstance.tenantId == tid)
    existing = (await db.execute(dup_stmt)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=409, detail="This substance is already declared for this part"
        )

    row = PartMaterialSubstance(
        part_material_id=material.id,
        substance_id=substance_id,
        concentration_ppm=data.get("mass_ppm") or 0,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    claims = await _claims_by_substance(db, part_id)
    return _composition_row_to_dict(row, claims)


async def update_part_composition(
    db: AsyncSession, part_id: int, row_id: int, patch: dict
) -> dict:
    row = await _get_composition_row_or_404(db, part_id, row_id)

    if "mass_ppm" in patch and patch["mass_ppm"] is not None:
        row.concentration_ppm = patch["mass_ppm"]

    if "is_exempt" in patch and patch["is_exempt"] is not None:
        manual = await _get_or_create_manual_exemption(db)
        tid = get_tenant_id()
        claim_stmt = select(ExemptionClaim).where(
            ExemptionClaim.part_id == part_id,
            ExemptionClaim.exemption_id == manual.id,
            ExemptionClaim.substance_id == row.substance_id,
        )
        if tid is not None:
            claim_stmt = claim_stmt.where(ExemptionClaim.tenantId == tid)
        existing_claim = (await db.execute(claim_stmt)).scalar_one_or_none()

        if patch["is_exempt"]:
            if existing_claim is None:
                claim = ExemptionClaim(
                    part_id=part_id,
                    exemption_id=manual.id,
                    substance_id=row.substance_id,
                    justification=patch.get("notes"),
                )
                db.add(claim)
            elif patch.get("notes") is not None:
                existing_claim.justification = patch["notes"]
        else:
            if existing_claim is not None:
                await db.delete(existing_claim)

    await db.commit()
    await db.refresh(row)
    claims = await _claims_by_substance(db, part_id)
    return _composition_row_to_dict(row, claims)


async def delete_part_composition(db: AsyncSession, part_id: int, row_id: int) -> None:
    row = await _get_composition_row_or_404(db, part_id, row_id)
    substance_id = row.substance_id
    await db.delete(row)

    tid = get_tenant_id()
    del_stmt = delete(ExemptionClaim).where(
        ExemptionClaim.part_id == part_id, ExemptionClaim.substance_id == substance_id
    )
    if tid is not None:
        del_stmt = del_stmt.where(ExemptionClaim.tenantId == tid)
    await db.execute(del_stmt)
    await db.commit()


# =====================================================================
# Compliance evaluation
# =====================================================================


async def _load_current_regulations(
    db: AsyncSession,
) -> tuple[dict[str, RegulationVersion], dict[str, list[RestrictedSubstanceEntry]]]:
    ver_stmt = select(RegulationVersion).where(
        RegulationVersion.regulation_code.in_(["ROHS3", "REACH_SVHC"]),
        RegulationVersion.is_current.is_(True),
    )
    versions = {v.regulation_code: v for v in (await db.execute(ver_stmt)).scalars().all()}
    entries: dict[str, list[RestrictedSubstanceEntry]] = {}
    for code, v in versions.items():
        rows = (
            await db.execute(
                select(RestrictedSubstanceEntry).where(
                    RestrictedSubstanceEntry.regulation_version_id == v.id
                )
            )
        ).scalars().all()
        entries[code] = rows
    return versions, entries


def _index_entries(
    entries: list[RestrictedSubstanceEntry],
) -> tuple[dict[int, RestrictedSubstanceEntry], dict[int, RestrictedSubstanceEntry]]:
    by_substance = {e.substance_id: e for e in entries if e.substance_id is not None}
    by_group = {e.substance_group_id: e for e in entries if e.substance_group_id is not None}
    return by_substance, by_group


def _exemption_covers(
    exemption: RohsExemption, eee_category: Optional[int]
) -> bool:
    if exemption.status != "ACTIVE":
        return False
    cats = exemption.applicable_eee_categories
    if cats and eee_category is not None and eee_category not in cats:
        return False

    valid_until = None
    if exemption.category_validity and eee_category is not None:
        cv = exemption.category_validity
        valid_until = cv.get(str(eee_category), cv.get(eee_category))
    if valid_until is None:
        valid_until = exemption.valid_until
    if valid_until:
        vu = valid_until if isinstance(valid_until, date) else date.fromisoformat(str(valid_until))
        if vu < date.today():
            return False
    return True


def _find_covering_exemption(
    claims_by_substance: dict[int, list[ExemptionClaim]],
    claims_by_group: dict[int, list[ExemptionClaim]],
    substance_id: int,
    group_id: Optional[int],
    eee_category: Optional[int],
) -> Optional[RohsExemption]:
    candidates: list[ExemptionClaim] = list(claims_by_substance.get(substance_id, []))
    if group_id is not None:
        candidates += claims_by_group.get(group_id, [])
    for claim in candidates:
        exemption = claim.exemption
        if exemption is not None and _exemption_covers(exemption, eee_category):
            return exemption
    return None


async def evaluate_part_compliance(
    db: AsyncSession,
    part_id: int,
    *,
    versions: Optional[dict[str, RegulationVersion]] = None,
    entries: Optional[dict[str, list[RestrictedSubstanceEntry]]] = None,
    bom_id: Optional[int] = None,
    persist: bool = True,
) -> dict:
    part = await _get_part_or_404(db, part_id)

    if versions is None or entries is None:
        versions, entries = await _load_current_regulations(db)

    tid = get_tenant_id()
    comp_stmt = (
        select(PartMaterialSubstance)
        .join(PartMaterial, PartMaterialSubstance.part_material_id == PartMaterial.id)
        .where(PartMaterial.part_id == part_id)
    )
    if tid is not None:
        comp_stmt = comp_stmt.where(
            PartMaterialSubstance.tenantId == tid, PartMaterial.tenantId == tid
        )
    comp_rows = (await db.execute(comp_stmt)).scalars().all()

    substance_ids = {r.substance_id for r in comp_rows}
    substances_by_id: dict[int, Substance] = {}
    if substance_ids:
        subs = (
            await db.execute(select(Substance).where(Substance.id.in_(substance_ids)))
        ).scalars().all()
        substances_by_id = {s.id: s for s in subs}

    claims = await _get_claims_for_part(db, part_id)
    claims_by_substance: dict[int, list[ExemptionClaim]] = {}
    claims_by_group: dict[int, list[ExemptionClaim]] = {}
    for c in claims:
        # Eager-load the exemption relationship without an async lazy-load surprise.
        exemption = (
            await db.execute(select(RohsExemption).where(RohsExemption.id == c.exemption_id))
        ).scalar_one_or_none()
        c.exemption = exemption  # type: ignore[attr-defined]
        if c.substance_id is not None:
            claims_by_substance.setdefault(c.substance_id, []).append(c)
        if c.substance_group_id is not None:
            claims_by_group.setdefault(c.substance_group_id, []).append(c)

    rohs_version = versions.get("ROHS3")
    rohs_by_sub, rohs_by_grp = _index_entries(entries.get("ROHS3", []))
    svhc_version = versions.get("REACH_SVHC")
    svhc_by_sub, svhc_by_grp = _index_entries(entries.get("REACH_SVHC", []))

    offending_substance_id: Optional[int] = None
    applied_exemption_id: Optional[int] = None
    any_exceedance = False

    if not comp_rows:
        rohs_status = "UNKNOWN"
        data_fidelity = "NO_DATA"
    else:
        any_noncompliant = False
        any_exempt_breach = False
        data_fidelity = "ASSERTED_FROM_SUMMARY"
        for row in comp_rows:
            if row.concentration_ppm is None:
                continue
            substance = substances_by_id.get(row.substance_id)
            group_id = substance.substance_group_id if substance else None
            entry = rohs_by_sub.get(row.substance_id)
            if entry is None and group_id is not None:
                entry = rohs_by_grp.get(group_id)
            if entry is None:
                continue
            if float(row.concentration_ppm) <= float(entry.threshold_ppm):
                continue
            any_exceedance = True
            covering = _find_covering_exemption(
                claims_by_substance, claims_by_group, row.substance_id, group_id, part.eee_category
            )
            if covering is not None:
                any_exempt_breach = True
                applied_exemption_id = applied_exemption_id or covering.id
            else:
                any_noncompliant = True
                offending_substance_id = offending_substance_id or row.substance_id

        if any_noncompliant:
            rohs_status = "NON_COMPLIANT"
        elif any_exempt_breach:
            rohs_status = "EXEMPT"
        else:
            rohs_status = "COMPLIANT"

    svhc_list: list[dict] = []
    svhc_concentrations: dict[int, float] = {}
    seen: set[int] = set()
    for row in comp_rows:
        if row.concentration_ppm is None:
            continue
        substance = substances_by_id.get(row.substance_id)
        if substance is None:
            continue
        group_id = substance.substance_group_id
        entry = svhc_by_sub.get(row.substance_id)
        if entry is None and group_id is not None:
            entry = svhc_by_grp.get(group_id)
        if entry is None:
            continue
        if float(row.concentration_ppm) <= float(entry.threshold_ppm):
            continue
        if row.substance_id in seen:
            continue
        seen.add(row.substance_id)
        svhc_concentrations[row.substance_id] = float(row.concentration_ppm)
        svhc_list.append(
            {"id": substance.id, "name": substance.name, "cas_number": substance.cas_number}
        )

    if persist and rohs_version is not None:
        await _upsert_evaluation(
            db,
            part_id=part_id,
            regulation_version_id=rohs_version.id,
            bom_id=None,
            status=rohs_status,
            exceedance=any_exceedance,
            driving_substance_id=offending_substance_id,
            applied_exemption_id=applied_exemption_id,
            data_fidelity=data_fidelity if comp_rows else "NO_DATA",
        )
        if bom_id is not None:
            await _upsert_evaluation(
                db,
                part_id=part_id,
                regulation_version_id=rohs_version.id,
                bom_id=bom_id,
                status=rohs_status,
                exceedance=any_exceedance,
                driving_substance_id=offending_substance_id,
                applied_exemption_id=applied_exemption_id,
                data_fidelity=data_fidelity if comp_rows else "NO_DATA",
            )
        await db.commit()

    if persist and svhc_version is not None and svhc_list:
        for s in svhc_list:
            await _upsert_reach_obligation(
                db,
                part_id=part_id,
                article_part_id=part_id,
                substance_id=s["id"],
                regulation_version_id=svhc_version.id,
                bom_id=None,
                concentration_ppm=svhc_concentrations.get(s["id"]),
            )
            if bom_id is not None:
                await _upsert_reach_obligation(
                    db,
                    part_id=part_id,
                    article_part_id=part_id,
                    substance_id=s["id"],
                    regulation_version_id=svhc_version.id,
                    bom_id=bom_id,
                    concentration_ppm=svhc_concentrations.get(s["id"]),
                )
        await db.commit()

    return {
        "part_id": part_id,
        "part_number": part.pn,
        "rohs_status": rohs_status.lower(),
        "svhc_substances": svhc_list,
    }


async def _upsert_evaluation(
    db: AsyncSession,
    *,
    part_id: int,
    regulation_version_id: int,
    bom_id: Optional[int],
    status: str,
    exceedance: bool,
    driving_substance_id: Optional[int],
    applied_exemption_id: Optional[int],
    data_fidelity: Optional[str],
) -> None:
    """Upsert a ComplianceEvaluation row, race-safe against a concurrent writer
    (e.g. another explicit persisting evaluation for the same part/version/basis
    in flight at the same time) hitting the same SELF/ROLLUP partial-unique
    index between our SELECT and INSERT. Never used on a GET path — GETs call
    the evaluator with persist=False and never reach this function.
    """
    tid = get_tenant_id()
    basis = "ROLLUP" if bom_id is not None else "SELF"

    def _select_stmt():
        stmt = select(ComplianceEvaluation).where(
            ComplianceEvaluation.part_id == part_id,
            ComplianceEvaluation.regulation_version_id == regulation_version_id,
            ComplianceEvaluation.basis == basis,
        )
        if basis == "SELF":
            stmt = stmt.where(ComplianceEvaluation.bom_id.is_(None))
        else:
            stmt = stmt.where(ComplianceEvaluation.bom_id == bom_id)
        if tid is not None:
            stmt = stmt.where(ComplianceEvaluation.tenantId == tid)
        return stmt

    def _apply(existing: ComplianceEvaluation, now: datetime) -> None:
        existing.status = status
        existing.exceedance = exceedance
        existing.driving_substance_id = driving_substance_id
        existing.applied_exemption_id = applied_exemption_id
        existing.data_fidelity = data_fidelity
        existing.evaluated_at = now
        existing.is_stale = False

    now = datetime.now(UTC)
    existing = (await db.execute(_select_stmt())).scalar_one_or_none()
    if existing is not None:
        _apply(existing, now)
        await db.flush()
        return

    row = ComplianceEvaluation(
        part_id=part_id,
        regulation_version_id=regulation_version_id,
        bom_id=bom_id,
        status=status,
        basis=basis,
        exceedance=exceedance,
        data_fidelity=data_fidelity,
        driving_substance_id=driving_substance_id,
        applied_exemption_id=applied_exemption_id,
        evaluated_at=now,
        is_stale=False,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        # Lost an insert race against the partial-unique index (a concurrent
        # writer inserted the same SELF/ROLLUP row between our SELECT and
        # INSERT). Re-select and update it instead of raising a 500 for a
        # benign duplicate.
        existing = (await db.execute(_select_stmt())).scalar_one_or_none()
        if existing is None:
            raise
        _apply(existing, now)
        await db.flush()


async def _upsert_reach_obligation(
    db: AsyncSession,
    *,
    part_id: int,
    article_part_id: int,
    substance_id: int,
    regulation_version_id: int,
    bom_id: Optional[int],
    concentration_ppm: Optional[float],
) -> None:
    """Upsert a ReachObligation row, race-safe against a concurrent writer
    hitting the same unique combination between our SELECT and INSERT (see
    ``_upsert_evaluation`` docstring — never reached from a GET path).
    """
    tid = get_tenant_id()

    def _select_stmt():
        stmt = select(ReachObligation).where(
            ReachObligation.part_id == part_id,
            ReachObligation.article_part_id == article_part_id,
            ReachObligation.substance_id == substance_id,
            ReachObligation.regulation_version_id == regulation_version_id,
        )
        stmt = (
            stmt.where(ReachObligation.bom_id == bom_id)
            if bom_id is not None
            else stmt.where(ReachObligation.bom_id.is_(None))
        )
        if tid is not None:
            stmt = stmt.where(ReachObligation.tenantId == tid)
        return stmt

    existing = (await db.execute(_select_stmt())).scalar_one_or_none()
    if existing is not None:
        existing.concentration_ppm = concentration_ppm
        await db.flush()
        return

    row = ReachObligation(
        part_id=part_id,
        article_part_id=article_part_id,
        substance_id=substance_id,
        regulation_version_id=regulation_version_id,
        bom_id=bom_id,
        concentration_ppm=concentration_ppm,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        existing = (await db.execute(_select_stmt())).scalar_one_or_none()
        if existing is None:
            raise
        existing.concentration_ppm = concentration_ppm
        await db.flush()


# =====================================================================
# BOM-wide compliance rollup
# =====================================================================


async def _get_bom_or_404(db: AsyncSession, bom_id: int) -> BOM:
    tid = get_tenant_id()
    stmt = select(BOM).where(BOM.id == bom_id)
    if tid is not None:
        stmt = stmt.where(BOM.tenantId == tid)
    bom = (await db.execute(stmt)).scalar_one_or_none()
    if bom is None:
        raise HTTPException(status_code=404, detail="BOM not found")
    return bom


async def evaluate_bom_compliance(
    db: AsyncSession, bom_id: int, *, persist: bool = True
) -> dict:
    bom = await _get_bom_or_404(db, bom_id)
    tid = get_tenant_id()

    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items = (await db.execute(items_stmt)).scalars().all()

    part_ids: list[int] = []
    seen_parts: set[int] = set()
    for item in items:
        if item.part_id is not None and item.part_id not in seen_parts:
            seen_parts.add(item.part_id)
            part_ids.append(item.part_id)

    versions, entries = await _load_current_regulations(db)

    parts_out: list[dict] = []
    for pid in part_ids:
        result = await evaluate_part_compliance(
            db, pid, versions=versions, entries=entries, bom_id=bom_id, persist=persist
        )
        parts_out.append(result)

    overall_status = "COMPLIANT"
    for candidate in _STATUS_PRIORITY:
        if any(p["rohs_status"] == candidate.lower() for p in parts_out):
            overall_status = candidate
            break

    svhc_union: list[dict] = []
    seen_svhc: set[int] = set()
    for p in parts_out:
        for s in p["svhc_substances"]:
            if s["id"] not in seen_svhc:
                seen_svhc.add(s["id"])
                svhc_union.append(s)

    return {
        "bom_id": bom_id,
        "rohs_status": overall_status.lower(),
        "svhc_substances": svhc_union,
        "parts": parts_out,
    }

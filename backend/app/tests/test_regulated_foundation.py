"""Smoke test for the RoHS/REACH substance-compliance BACKEND FOUNDATION.

Proves (spec 10.11 verification items, foundation scope):
  1. Every new model imports and maps; global tables are NOT tenant-aware,
     tenant-owned tables ARE (so register_tenant_listeners sees them). The
     session-scoped conftest engine also create_all()s the full metadata,
     proving the schema builds clean on SQLite.
  2. The migration chain is a single linear head 041 -> 042 -> 043 -> 044.
  3. On a fresh SQLite DB, `alembic upgrade` runs 042 -> 043 -> 044 clean
     (stamped at 041; the pre-041 chain is Postgres-only — 001/019 issue
     `CREATE EXTENSION pgcrypto`), the 042 idempotent seed loads the bundled
     reference data (Cd @ 100 ppm), and the 043 cold-start backfill derives
     part_kind / is_article.
  4. A tenant-aware row (PartMaterial) gets tenantId auto-populated on INSERT.
"""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from app.models.compliance_evaluation import ComplianceEvaluation, ReachObligation
from app.models.mixins import TenantAwareMixin
from app.models.part import Part
from app.models.part_composition import (
    ExemptionClaim,
    PartMaterial,
    PartMaterialSubstance,
    SubstanceDeclaration,
)
from app.models.substance import (
    RegulationVersion,
    RestrictedSubstanceEntry,
    RohsExemption,
    Substance,
    SubstanceGroup,
)

BACKEND_DIR = Path(__file__).resolve().parents[2]


# ---------- 1. Models import / mapping ----------

def test_all_models_import_and_tenant_awareness():
    # Global reference tables are NOT tenant-aware (no tenantId, no RLS).
    for model, table in [
        (SubstanceGroup, "substance_groups"),
        (Substance, "substances"),
        (RegulationVersion, "regulation_versions"),
        (RestrictedSubstanceEntry, "restricted_substance_entries"),
        (RohsExemption, "rohs_exemptions"),
    ]:
        assert model.__tablename__ == table
        assert not issubclass(model, TenantAwareMixin), f"{model.__name__} must be GLOBAL"
        assert "tenantId" not in model.__table__.c

    # Tenant-owned tables ARE tenant-aware.
    for model, table in [
        (PartMaterial, "part_materials"),
        (PartMaterialSubstance, "part_material_substances"),
        (SubstanceDeclaration, "substance_declarations"),
        (ExemptionClaim, "exemption_claims"),
        (ComplianceEvaluation, "compliance_evaluations"),
        (ReachObligation, "reach_obligations"),
    ]:
        assert model.__tablename__ == table
        assert issubclass(model, TenantAwareMixin), f"{model.__name__} must be tenant-owned"
        assert "tenantId" in model.__table__.c

    # ppm precision deviation (Numeric(12,4)); mass = Numeric(10,4).
    assert PartMaterialSubstance.__table__.c.concentration_ppm.type.precision == 12
    assert PartMaterial.__table__.c.mass_g.type.precision == 10
    # STEP 0: declaration supplier FK targets `vendors`, not `suppliers`.
    fk = next(iter(SubstanceDeclaration.__table__.c.supplier_id.foreign_keys))
    assert fk.column.table.name == "vendors"
    # STEP 0: parts gained the three columns.
    for col in ("is_article", "eee_category", "part_kind"):
        assert col in Part.__table__.c


# ---------- 2. Migration chain topology ----------

def test_migration_chain_single_linear_head():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    script = ScriptDirectory.from_config(cfg)

    assert script.get_heads() == ["044_compliance_evaluations"]
    links = {
        "044_compliance_evaluations": "043_part_composition_declarations",
        "043_part_composition_declarations": "042_substance_reference_data",
        "042_substance_reference_data": "041_part11_esignatures",
    }
    for rev, down in links.items():
        assert script.get_revision(rev).down_revision == down


# ---------- 3. Fresh-SQLite upgrade 042->043->044 + seed + backfill ----------

def test_migrations_upgrade_seed_and_backfill_on_fresh_sqlite(tmp_path):
    db_file = tmp_path / "reg_found_chain.db"
    url = "sqlite+aiosqlite:///" + str(db_file).replace("\\", "/")

    # Minimal pre-041 prerequisite: a `parts` table (WITHOUT the 043 columns)
    # plus sample rows for the backfill to act on. The rest of the pre-041
    # schema is unnecessary here — SQLite does not validate FK targets at
    # CREATE TABLE time, so 042-044 create their tables regardless.
    conn = sqlite3.connect(str(db_file))
    conn.executescript(
        """
        CREATE TABLE parts (
            id INTEGER PRIMARY KEY,
            "tenantId" INTEGER,
            pn TEXT,
            name TEXT,
            category TEXT,
            assembly INTEGER,
            weight REAL
        );
        INSERT INTO parts (id, "tenantId", pn, name, category, assembly, weight) VALUES
            (1, 1, 'ASM-1',  'Top assembly', 'Assembly',     1, 100.0),
            (2, 1, 'RAW-1',  'Bulk resin',   'Raw Material', 0, 50.0),
            (3, 1, 'LEAF-1', 'Resistor',     'Electrical',   0, 5.0);
        """
    )
    conn.commit()
    conn.close()

    env = os.environ.copy()
    env["DATABASE_URL"] = url
    env.pop("DATABASE_URI", None)

    def run_alembic(*args):
        return subprocess.run(
            [sys.executable, "-m", "alembic", *args],
            cwd=str(BACKEND_DIR),
            env=env,
            capture_output=True,
            text=True,
        )

    stamp = run_alembic("stamp", "041_part11_esignatures")
    assert stamp.returncode == 0, f"stamp failed:\n{stamp.stdout}\n{stamp.stderr}"
    up = run_alembic("upgrade", "head")
    assert up.returncode == 0, f"upgrade failed:\n{up.stdout}\n{up.stderr}"

    # Inspect the migrated DB.
    conn = sqlite3.connect(str(db_file))
    try:
        cur = conn.cursor()

        version = cur.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        assert version == "044_compliance_evaluations"

        # All new tables exist.
        tables = {
            r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        for t in [
            "substance_groups", "substances", "regulation_versions",
            "restricted_substance_entries", "rohs_exemptions", "part_materials",
            "part_material_substances", "substance_declarations", "exemption_claims",
            "compliance_evaluations", "reach_obligations",
        ]:
            assert t in tables, f"missing table {t}"

        # Seed loaded (idempotent bundled snapshot).
        assert cur.execute("SELECT COUNT(*) FROM substance_groups").fetchone()[0] == 4
        assert cur.execute("SELECT COUNT(*) FROM substances").fetchone()[0] == 28
        assert cur.execute("SELECT COUNT(*) FROM rohs_exemptions").fetchone()[0] == 10

        regs = dict(
            cur.execute("SELECT regulation_code, is_current FROM regulation_versions").fetchall()
        )
        assert regs == {"ROHS3": 1, "REACH_SVHC": 1}

        rohs_ver = cur.execute(
            "SELECT id FROM regulation_versions WHERE regulation_code='ROHS3'"
        ).fetchone()[0]
        svhc_ver = cur.execute(
            "SELECT id FROM regulation_versions WHERE regulation_code='REACH_SVHC'"
        ).fetchone()[0]
        assert cur.execute(
            "SELECT COUNT(*) FROM restricted_substance_entries WHERE regulation_version_id=?",
            (rohs_ver,),
        ).fetchone()[0] == 10
        assert cur.execute(
            "SELECT COUNT(*) FROM restricted_substance_entries WHERE regulation_version_id=?",
            (svhc_ver,),
        ).fetchone()[0] == 26

        # Cd @ 100 ppm (0.01% exception); Pb @ 1000 ppm.
        cd_threshold = cur.execute(
            "SELECT rse.threshold_ppm FROM restricted_substance_entries rse "
            "JOIN substances s ON s.id=rse.substance_id "
            "WHERE rse.regulation_version_id=? AND s.cas_number='7440-43-9'",
            (rohs_ver,),
        ).fetchone()[0]
        assert float(cd_threshold) == 100.0
        pb_threshold = cur.execute(
            "SELECT rse.threshold_ppm FROM restricted_substance_entries rse "
            "JOIN substances s ON s.id=rse.substance_id "
            "WHERE rse.regulation_version_id=? AND s.cas_number='7439-92-1'",
            (rohs_ver,),
        ).fetchone()[0]
        assert float(pb_threshold) == 1000.0

        # Per-category differentiated expiry survives (P16).
        cv = cur.execute(
            "SELECT category_validity FROM rohs_exemptions WHERE code='6(c)'"
        ).fetchone()[0]
        assert cv is not None and "8" in cv

        # Cold-start backfill (P4).
        backfilled = dict(
            (pid, (kind, art))
            for pid, kind, art in cur.execute(
                "SELECT id, part_kind, is_article FROM parts ORDER BY id"
            ).fetchall()
        )
        assert backfilled[1] == ("ASSEMBLY", 0)      # assembly -> not an article
        assert backfilled[2] == ("RAW_MATERIAL", 1)
        assert backfilled[3] == ("PURCHASED", 1)
    finally:
        conn.close()

    # Idempotency: re-running the seed via a sync connection changes nothing.
    from sqlalchemy import create_engine
    from sqlalchemy import text as sa_text

    from app.services.reference_seed import seed_reference_data

    eng = create_engine("sqlite:///" + str(db_file).replace("\\", "/"))
    with eng.begin() as c:
        seed_reference_data(c)
    with eng.connect() as c:
        assert c.execute(sa_text("SELECT COUNT(*) FROM substances")).scalar() == 28
        assert c.execute(sa_text("SELECT COUNT(*) FROM rohs_exemptions")).scalar() == 10
    eng.dispose()


# ---------- 4. tenantId auto-population on a tenant-aware row ----------

@pytest.mark.asyncio
async def test_part_material_autopopulates_tenant_id(db_session, test_tenant):
    # test_tenant is created under the autouse tenant context (tenant_id=1).
    part = Part(pn="PN-AUTOPOP", name="Widget", category="Electrical", tenantId=test_tenant.id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)

    # Note: NO tenantId passed — the before_insert listener must fill it in.
    pm = PartMaterial(part_id=part.id, name="ABS housing", mass_g=12.5)
    db_session.add(pm)
    await db_session.commit()
    await db_session.refresh(pm)

    assert pm.tenantId == test_tenant.id

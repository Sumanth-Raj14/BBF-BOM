"""Idempotent loader for the bundled, GLOBAL regulatory reference data.

Reads the versioned local-first JSON snapshots under ``app/data/reference``
(RoHS 3, a REACH SVHC Candidate-List subset, RoHS Annex III/IV exemptions,
and the substance groups) and upserts them into the global reference tables
created by migration ``042_substance_reference_data``:

    substance_groups, substances, regulation_versions,
    restricted_substance_entries, rohs_exemptions

These rows are **global** (system-owned, no ``tenantId``, shared by every
tenant), so seeding runs with no tenant in context and stays correct for
tenants created later (spec P1). The load is idempotent — every row is
upserted on its natural key — so re-running (migration re-apply, or the
``POST /compliance/reference/seed`` endpoint at tenant creation) is a safe
no-op for data already present. NO network access: the ECHA list is never
fetched at runtime.

This function operates on a raw SQLAlchemy ``Connection`` via Core
constructs, so it deliberately bypasses the ORM tenant-isolation event
listeners (which are Session-scoped) — correct, because these tables have
no ``tenantId``.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import sqlalchemy as sa

import app as _app_pkg

REFERENCE_DIR = Path(_app_pkg.__file__).parent / "data" / "reference"

# Lightweight typed table clauses (own MetaData — never registered against
# the app's Base) so Core INSERT/UPDATE adapts Date / JSON / Numeric binds
# correctly per dialect.
_md = sa.MetaData()

_substance_groups = sa.Table(
    "substance_groups",
    _md,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("code", sa.String),
    sa.Column("name", sa.String),
)
_substances = sa.Table(
    "substances",
    _md,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("cas_number", sa.String),
    sa.Column("ec_number", sa.String),
    sa.Column("name", sa.String),
    sa.Column("substance_group_id", sa.Integer),
)
_regulation_versions = sa.Table(
    "regulation_versions",
    _md,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("regulation_code", sa.String),
    sa.Column("version_label", sa.String),
    sa.Column("effective_date", sa.Date),
    sa.Column("source", sa.String),
    sa.Column("entry_count", sa.Integer),
    sa.Column("is_current", sa.Boolean),
)
_restricted_entries = sa.Table(
    "restricted_substance_entries",
    _md,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("regulation_version_id", sa.Integer),
    sa.Column("substance_id", sa.Integer),
    sa.Column("substance_group_id", sa.Integer),
    sa.Column("threshold_ppm", sa.Numeric(12, 4)),
    sa.Column("threshold_basis", sa.String),
    sa.Column("applicability", sa.JSON),
)
_rohs_exemptions = sa.Table(
    "rohs_exemptions",
    _md,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("code", sa.String),
    sa.Column("annex", sa.String),
    sa.Column("substance_id", sa.Integer),
    sa.Column("substance_group_id", sa.Integer),
    sa.Column("application_scope", sa.Text),
    sa.Column("applicable_eee_categories", sa.JSON),
    sa.Column("valid_until", sa.Date),
    sa.Column("category_validity", sa.JSON),
    sa.Column("status", sa.String),
)


def _load(name: str) -> dict:
    return json.loads((REFERENCE_DIR / name).read_text(encoding="utf-8"))


def _parse_date(value):
    return date.fromisoformat(value) if value else None


def _row_id(conn, table, **keys):
    stmt = sa.select(table.c.id)
    for col, val in keys.items():
        stmt = stmt.where(table.c[col] == val)
    return conn.execute(stmt).scalar()


def _upsert(conn, table, natural: dict, extra: dict) -> int:
    """Insert on the natural key, or update the mutable columns if present.

    ``extra`` values that are ``None`` are skipped on UPDATE so a later,
    less-specific source (e.g. a substance appearing in both the RoHS and
    SVHC files) cannot null out a value an earlier source already set.
    """
    existing = _row_id(conn, table, **natural)
    if existing is not None:
        changes = {k: v for k, v in extra.items() if v is not None}
        if changes:
            conn.execute(table.update().where(table.c.id == existing).values(**changes))
        return existing
    conn.execute(table.insert().values(**natural, **extra))
    return _row_id(conn, table, **natural)


def seed_reference_data(conn) -> dict:
    """Idempotently load the bundled reference snapshot. Returns a small
    audit summary of row counts touched (handy for the seed endpoint)."""
    # 1) Substance groups (frozen scope, spec 10.8)
    group_id_by_code: dict[str, int] = {}
    for grp in _load("substance_groups.json")["groups"]:
        gid = _upsert(conn, _substance_groups, {"code": grp["code"]}, {"name": grp["name"]})
        group_id_by_code[grp["code"]] = gid

    rohs3 = _load("rohs3.json")
    svhc = _load("svhc_candidate_list.json")

    # 2) Substances (shared across regulations; one row per CAS)
    substance_id_by_cas: dict[str, int] = {}

    def ensure_substance(entry: dict):
        cas = entry.get("cas_number")
        if not cas:
            return None
        extra = {"name": entry["name"]}
        if entry.get("ec_number"):
            extra["ec_number"] = entry["ec_number"]
        if entry.get("group"):
            extra["substance_group_id"] = group_id_by_code.get(entry["group"])
        sid = _upsert(conn, _substances, {"cas_number": cas}, extra)
        substance_id_by_cas[cas] = sid
        return sid

    for entry in rohs3["substances"]:
        ensure_substance(entry)
    for entry in svhc["substances"]:
        ensure_substance(entry)

    # 3) ROHS3 regulation version + restricted entries (homogeneous material)
    rohs_basis = rohs3.get("threshold_basis", "HOMOGENEOUS_MATERIAL")
    rohs_ver = _upsert(
        conn,
        _regulation_versions,
        {"regulation_code": rohs3["regulation_code"], "version_label": rohs3["version_label"]},
        {
            "effective_date": _parse_date(rohs3.get("effective_date")),
            "source": "BUNDLED",
            "entry_count": len(rohs3["substances"]),
            "is_current": True,
        },
    )
    for entry in rohs3["substances"]:
        if entry.get("cas_number"):
            _upsert(
                conn,
                _restricted_entries,
                {"regulation_version_id": rohs_ver, "substance_id": substance_id_by_cas[entry["cas_number"]]},
                {"substance_group_id": None, "threshold_ppm": entry["threshold_ppm"], "threshold_basis": rohs_basis},
            )
        else:
            _upsert(
                conn,
                _restricted_entries,
                {"regulation_version_id": rohs_ver, "substance_group_id": group_id_by_code[entry["group"]]},
                {"substance_id": None, "threshold_ppm": entry["threshold_ppm"], "threshold_basis": rohs_basis},
            )

    # 4) REACH SVHC regulation version + restricted entries (per-article)
    svhc_basis = svhc.get("threshold_basis", "ARTICLE")
    svhc_threshold = svhc.get("threshold_ppm", 1000)
    svhc_ver = _upsert(
        conn,
        _regulation_versions,
        {"regulation_code": svhc["regulation_code"], "version_label": svhc["version_label"]},
        {
            "effective_date": _parse_date(svhc.get("effective_date")),
            "source": "BUNDLED",
            "entry_count": len(svhc["substances"]),
            "is_current": True,
        },
    )
    for entry in svhc["substances"]:
        _upsert(
            conn,
            _restricted_entries,
            {"regulation_version_id": svhc_ver, "substance_id": substance_id_by_cas[entry["cas_number"]]},
            {"substance_group_id": None, "threshold_ppm": svhc_threshold, "threshold_basis": svhc_basis},
        )

    # 5) RoHS Annex III/IV exemptions
    exemptions = _load("rohs_exemptions.json")["exemptions"]
    for ex in exemptions:
        sub_id = substance_id_by_cas.get(ex["substance_cas"]) if ex.get("substance_cas") else None
        grp_id = group_id_by_code.get(ex["substance_group"]) if ex.get("substance_group") else None
        _upsert(
            conn,
            _rohs_exemptions,
            {"code": ex["code"]},
            {
                "annex": ex["annex"],
                "substance_id": sub_id,
                "substance_group_id": grp_id,
                "application_scope": ex.get("application_scope"),
                "applicable_eee_categories": ex.get("applicable_eee_categories"),
                "valid_until": _parse_date(ex.get("valid_until")),
                "category_validity": ex.get("category_validity"),
                "status": ex.get("status", "ACTIVE"),
            },
        )

    return {
        "substance_groups": len(group_id_by_code),
        "substances": len(substance_id_by_cas),
        "regulation_versions": 2,
        "rohs_restricted_entries": len(rohs3["substances"]),
        "svhc_restricted_entries": len(svhc["substances"]),
        "rohs_exemptions": len(exemptions),
    }

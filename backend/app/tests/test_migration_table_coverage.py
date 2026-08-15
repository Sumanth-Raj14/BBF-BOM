"""Guard: a NEW model table must come with a migration that creates it.

The bug this exists to prevent (found 2026-08-15, fixed in 058_calendar_events):
`calendar_events` had a model, a registered CRUD router, and live frontend
calls — but no migration ever created it. It only existed because
`Base.metadata.create_all()` made it. Every CI path bootstraps a fresh database
(SQLite directly, Postgres via scripts.init_db's greenfield create_all branch),
so CI was green while the endpoint 500'd on any deployment that took the
incremental `alembic upgrade head` path.

Why a baseline instead of "every table needs a migration": 74 tables predate
migration 022 and are create_all-only by design — see scripts/init_db.py, the
early chain genuinely cannot build from base. Those already exist in every real
database (create_all ran at bootstrap). Retro-fitting migrations for them would
be churn with no deployment benefit.

The risk is only for tables added to the models AFTER a deployment was
bootstrapped: an existing alembic-managed database gets `upgrade head` and
nothing else, so a table with no migration never appears there.

So: freeze the known set, fail on anything new.

If this test fails, you added a model table without a migration. Write the
migration (see 058_calendar_events.py for the idempotent pattern that tolerates
create_all-bootstrapped databases). Do NOT add the table to the baseline file
unless you can explain why a migrate-only deployment does not need it.
"""

import pathlib
import re

BACKEND = pathlib.Path(__file__).resolve().parents[2]
BASELINE = pathlib.Path(__file__).parent / "_migration_baseline.txt"


def _read_baseline() -> set[str]:
    """Table names from the baseline file, ignoring `#` comments and blanks."""
    return {
        line.strip()
        for line in BASELINE.read_text(encoding="utf8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def _tables_created_by_migrations() -> set[str]:
    """Table names any migration creates, via op.create_table or raw DDL.

    Migration 022 and friends use raw `op.execute("CREATE TABLE IF NOT
    EXISTS ...")` rather than op.create_table, so both forms must be matched or
    this test reports false positives.
    """
    blob = "".join(
        f.read_text(encoding="utf8")
        for f in (BACKEND / "alembic" / "versions").glob("*.py")
    )
    names = set(re.findall(r"create_table\(\s*[\"']([a-zA-Z0-9_]+)", blob))
    names |= {
        n.strip('"')
        for n in re.findall(
            r'CREATE TABLE (?:IF NOT EXISTS )?([a-zA-Z0-9_"]+)', blob, re.I
        )
    }
    return names


def test_new_model_tables_have_a_migration():
    from app.db.base import Base

    import app.models  # noqa: F401  (populate Base.metadata with every model)

    baseline = _read_baseline()
    uncovered = set(Base.metadata.tables) - _tables_created_by_migrations()
    new = sorted(uncovered - baseline)

    assert not new, (
        f"{len(new)} model table(s) have no migration that creates them: {new}. "
        "A deployment on the incremental `alembic upgrade head` path will not "
        "have these tables, and every endpoint touching them will 500 while CI "
        "stays green. Write a migration (pattern: alembic/versions/"
        "058_calendar_events.py)."
    )


def test_baseline_has_no_stale_entries():
    """Keep the baseline honest: shrink it when a table gains a migration.

    Without this, the baseline only ever grows and slowly stops meaning
    anything.
    """
    from app.db.base import Base

    import app.models  # noqa: F401

    baseline = _read_baseline()
    covered_now = _tables_created_by_migrations()
    gone = sorted(t for t in baseline if t not in Base.metadata.tables)
    now_migrated = sorted(baseline & covered_now)

    assert not (gone or now_migrated), (
        "app/tests/_migration_baseline.txt is stale — remove these lines: "
        f"no longer a model table: {gone}; now created by a migration: "
        f"{now_migrated}."
    )

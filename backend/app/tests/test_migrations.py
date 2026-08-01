"""Test Alembic migration chain integrity and offline generation."""

from pathlib import Path

import pytest
from alembic.command import downgrade, upgrade
from alembic.config import Config
from alembic.script import ScriptDirectory

ALEMBIC_CFG = Path(__file__).parents[2] / "alembic.ini"


def test_migration_chain_is_linear():
    config = Config(str(ALEMBIC_CFG))
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected 1 head, got {len(heads)}: {heads}"


def test_migration_chain_no_gaps():
    config = Config(str(ALEMBIC_CFG))
    script = ScriptDirectory.from_config(config)
    revisions = list(script.walk_revisions())
    assert len(revisions) >= 7, f"Expected at least 7 migrations, got {len(revisions)}"
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected 1 head, got {len(heads)}"
    base = revisions[-1]
    assert base.doc == "Initial migration - create all tables."

    rev_map = {r.revision: r for r in revisions}
    for rev in revisions:
        if rev.down_revision:
            assert rev.down_revision in rev_map, (
                f"Gap: {rev.revision} depends on {rev.down_revision} which is missing"
            )


@pytest.mark.xfail(
    reason=(
        "Offline SQL generation is unsupported by design: several migrations "
        "(035+) call inspect(op.get_bind()) to do conditional DDL (add-column-"
        "if-missing, etc). In --sql offline mode the bind is a MockConnection "
        "with no live DB to inspect, so those migrations raise "
        "NoInspectionAvailable. The supported bootstrap is scripts.init_db "
        "(create_all + stamp head), covered by the fresh-install-postgres CI "
        "job. Kept as xfail so it flags if a future change makes offline SQL "
        "gen viable."
    ),
    strict=False,
    raises=Exception,
)
def test_migration_offline_sql():
    config = Config(str(ALEMBIC_CFG))
    config.set_main_option("sqlalchemy.url", "postgresql+asyncpg://x:x@localhost/x")
    upgrade(config, revision="head", sql=True)


@pytest.mark.skip(reason="Requires running PostgreSQL on localhost")
def test_migration_up_down_cycle():
    config = Config(str(ALEMBIC_CFG))
    upgrade(config, revision="head")
    downgrade(config, revision="base")


def test_migration_revision_ids_are_unique():
    config = Config(str(ALEMBIC_CFG))
    script = ScriptDirectory.from_config(config)
    revs = list(script.walk_revisions())
    ids = [r.revision for r in revs]
    assert len(ids) == len(set(ids)), f"Duplicate revision IDs: {ids}"


def test_migration_files_exist():
    versions_dir = ALEMBIC_CFG.parent / "alembic" / "versions"
    py_files = sorted(versions_dir.glob("*.py"))
    py_files = [f for f in py_files if f.name != "__init__.py"]
    assert len(py_files) >= 7, f"Expected >=7 migration files, found {len(py_files)}"


def test_no_raw_sql_in_versions():
    versions_dir = ALEMBIC_CFG.parent / "alembic" / "versions"
    sql_files = list(versions_dir.glob("*.sql"))
    assert len(sql_files) == 0, (
        f"Raw SQL files found in versions/: {sql_files}. "
        "All raw SQL should be archived in sql_archive/"
    )

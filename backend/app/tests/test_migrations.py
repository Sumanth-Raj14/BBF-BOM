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


def test_migration_offline_sql():
    config = Config(str(ALEMBIC_CFG))
    config.set_main_option("sqlalchemy.url", "postgresql+asyncpg://x:x@localhost/x")
    buf = []
    try:
        upgrade(config, revision="head", sql=True)
        buf.append("upgrade SQL generated OK")
    except Exception as e:
        pytest.fail(f"Migration upgrade failed in offline mode: {e}")


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


def test_sql_archive_still_has_originals():
    archive_dir = ALEMBIC_CFG.parent / "alembic" / "versions" / "sql_archive"
    assert archive_dir.exists(), "sql_archive/ directory missing"
    sql_files = list(archive_dir.glob("*.sql"))
    assert len(sql_files) >= 3, f"Expected >=3 archived SQL files, found {len(sql_files)}"

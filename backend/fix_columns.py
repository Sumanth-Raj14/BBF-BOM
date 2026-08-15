"""One-off DDL patch for three columns missing on enterprise screens.

SUPERSEDED: every ALTER TABLE this script runs is now also applied by Alembic
migration 008_enterprise_fixes (backend/alembic/versions/008_enterprise_fixes.py),
which was added after this script was written. On any database that has run
migrations (i.e. anything provisioned via scripts/init_db.py or
`alembic upgrade head` since 008 landed), this script is a no-op --
`ADD COLUMN IF NOT EXISTS` finds the columns already there. It is kept, inert,
for old environments that were patched by this script before 008 existed and
have never been migrated since. Do not add new columns here; add a migration.

INCIDENT (2026-08-09): this script used to run its ALTER TABLE statements at
MODULE IMPORT TIME (`asyncio.run(run())` at the bottom, no `__main__` guard),
via a raw asyncpg connection built from POSTGRES_* env vars -- entirely
outside app.db.session.resolve_database_url() and the seed guard. Merely
`import fix_columns`-ing this module mutated a live schema. Fixed: execution
now only happens when run directly, and it resolves/guards its target DB the
same way every other destructive script does.
"""

import asyncio

import asyncpg

from scripts._db_guard import require_non_production_db


def _asyncpg_dsn(sqlalchemy_url: str) -> str:
    """asyncpg.connect() doesn't understand the '+asyncpg' driver suffix SQLAlchemy uses."""
    return sqlalchemy_url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def run() -> None:
    url = require_non_production_db()  # raises if this looks like a live DB
    if not url.startswith(("postgresql://", "postgresql+asyncpg://")):
        raise RuntimeError(f"fix_columns.py only supports Postgres, got: {url}")
    conn = await asyncpg.connect(_asyncpg_dsn(url))
    try:
        await conn.execute(
            "ALTER TABLE service_bom_headers ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'maintenance'"
        )
        await conn.execute(
            "ALTER TABLE routing_tables ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'"
        )
        await conn.execute(
            "ALTER TABLE process_plans ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(10,2) DEFAULT 0"
        )
        print("Columns added successfully")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run())

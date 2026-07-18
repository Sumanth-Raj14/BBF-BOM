"""Create compliance pack / part certification tables (idempotent).

`app/api/endpoints/compliance_api.py` reads and writes `compliance_packs`,
`compliance_pack_items`, and `part_certifications` via raw SQL, and ORM
models now exist for them in `app/models/compliance.py`, but no migration
ever formalized these tables -- so any DB that only ever ran
`alembic upgrade head` (rather than the historical `create_all` bootstrap)
is missing them entirely.

Uses `CREATE TABLE IF NOT EXISTS` (rather than `op.create_table`, which
issues a plain `CREATE TABLE` and errors on a pre-existing relation) because
some databases -- e.g. `bom_db` -- already have these three tables as
legacy `Base.metadata.create_all()` residue from before this migration
existed. That makes upgrade() safe to run unconditionally on both a
brand-new migration-managed DB and an existing one that already has the
tables, without needing to branch on which case applies.

Revision ID: 041_compliance_pack_tables
Revises: 040_postgres_rls_tenant_isolation
Create Date: 2026-07-19

"""

from collections.abc import Sequence

from alembic import op

revision: str = "041_compliance_pack_tables"
down_revision: str | None = "040_postgres_rls_tenant_isolation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS compliance_packs (
            id serial PRIMARY KEY,
            name varchar NOT NULL,
            standard_id int REFERENCES compliance(id) ON DELETE SET NULL,
            description text,
            "createdAt" timestamptz DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS compliance_pack_items (
            id serial PRIMARY KEY,
            pack_id int REFERENCES compliance_packs(id) ON DELETE CASCADE,
            requirement text NOT NULL,
            sort_order int DEFAULT 0
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS part_certifications (
            id serial PRIMARY KEY,
            part_id int REFERENCES parts(id) ON DELETE CASCADE,
            compliance_id int REFERENCES compliance(id) ON DELETE CASCADE,
            certified_by varchar,
            certification_date date,
            expiry_date date,
            notes text,
            "createdAt" timestamptz DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS part_certifications")
    op.execute("DROP TABLE IF EXISTS compliance_pack_items")
    op.execute("DROP TABLE IF EXISTS compliance_packs")

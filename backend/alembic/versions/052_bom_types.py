"""xBOM: bom_type discriminator on boms (EBOM / MBOM / SBOM).

Adds `boms.bom_type`, NOT NULL, defaulting to 'EBOM'. The server-side DEFAULT
backfills every existing row on the ALTER (Postgres applies a constant
DEFAULT to existing rows as part of the same DDL statement — no separate
UPDATE needed), so every BOM created before this migration keeps reading
back as "EBOM" with zero behavior change.

The actual manufacturing-BOM structure lives in mbom_headers/mbom_items
(already migrated, see app/models/mbom.py) — this column only tags what
kind of `boms` row a given BOM is, for filtering/labeling.

Revision ID: 052_bom_types
Revises: 051_export_templates
"""

from alembic import op
from sqlalchemy import inspect

revision = "052_bom_types"
down_revision = "051_export_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "boms" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("boms")}
    if "bom_type" not in columns:
        import sqlalchemy as sa

        with op.batch_alter_table("boms") as batch:
            batch.add_column(
                sa.Column(
                    "bom_type",
                    sa.String(length=10),
                    nullable=False,
                    server_default="EBOM",
                )
            )

    if bind.dialect.name != "postgresql":
        # SQLite cannot ADD CONSTRAINT and the test schema is built by
        # create_all(), which already includes the model's CheckConstraint.
        return
    existing = {c.get("name") for c in insp.get_check_constraints("boms")}
    if "ck_boms_bom_type" not in existing:
        op.execute(
            'ALTER TABLE "boms" ADD CONSTRAINT "ck_boms_bom_type" '
            "CHECK (bom_type IN ('EBOM', 'MBOM', 'SBOM')) NOT VALID"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute('ALTER TABLE IF EXISTS "boms" DROP CONSTRAINT IF EXISTS "ck_boms_bom_type"')
    with op.batch_alter_table("boms") as batch:
        batch.drop_column("bom_type")

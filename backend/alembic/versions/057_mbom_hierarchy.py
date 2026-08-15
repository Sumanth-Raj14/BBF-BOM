"""MBOM sub-assembly hierarchy.

derive_mbom_from_ebom copied EBOM lines into mbom_items as a flat list —
MbomItem had no parent column, so a nested sub-assembly on the EBOM side had
no way to come across. Adds `parent_item_id` (self-referential FK, nullable,
ON DELETE CASCADE) mirroring BOMItem.parent_item_id in app/models/bom.py.
Nullable/additive so every existing flat-BOM row stays valid.

Revision ID: 057_mbom_hierarchy
Revises: 056_cad_connections
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "057_mbom_hierarchy"
down_revision: str | None = "056_cad_connections"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable self-referential FK add — no-op-safe on existing rows for both
    # Postgres and SQLite (see 045_catalogs_and_bom_item_media for the same
    # batch_alter_table + separate create_index pattern on a sibling table).
    with op.batch_alter_table("mbom_items") as batch:
        batch.add_column(
            sa.Column(
                "parent_item_id",
                sa.Integer(),
                sa.ForeignKey("mbom_items.id", ondelete="CASCADE"),
                nullable=True,
            )
        )
    op.create_index(
        "ix_mbom_items_parent_item_id", "mbom_items", ["parent_item_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_mbom_items_parent_item_id", table_name="mbom_items")
    with op.batch_alter_table("mbom_items") as batch:
        batch.drop_column("parent_item_id")

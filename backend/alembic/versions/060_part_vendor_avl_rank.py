"""Add part_vendors."avlRank" — the AVL ordering a buyer sets by hand.

The approved-vendor list already had everything except a way to ORDER the
non-preferred sources. isPreferred/isAlternate are booleans: they say "this one
first" and "this one is a backup", but with three or more backups there was
nowhere to record that vendor B outranks vendor C. Buyers were falling back to
the free-text `notes` column.

Nullable with no server_default: existing rows stay unranked and sort last
(see the coalesce in app/api/endpoints/part_vendors.py) instead of every
pre-existing row claiming rank 0.

Idempotent — 022 created part_vendors, but every create_all-bootstrapped
database already has this column from the model, so re-adding it would fail.

Revision ID: 060_part_vendor_avl_rank
Revises: 059_formalize_create_all_tables
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "060_part_vendor_avl_rank"
down_revision: str | None = "059_formalize_create_all_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_column(bind) -> bool:
    insp = inspect(bind)
    if "part_vendors" not in insp.get_table_names():
        return False
    return "avlRank" in {c["name"] for c in insp.get_columns("part_vendors")}


def upgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind):
        # Already present from a create_all bootstrap — nothing to do.
        return
    op.add_column("part_vendors", sa.Column("avlRank", sa.Integer()))


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind):
        return
    op.drop_column("part_vendors", "avlRank")

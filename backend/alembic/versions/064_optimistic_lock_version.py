"""Add lock_version to parts, bom_items, bom_templates — optimistic locking.

Every write path on these three tables was a read-modify-write with no guard.
Two engineers editing the same BOM line both loaded qty=10; one saved 12, the
other saved 15, and the 12 was gone with neither user told anything. That is
silent lost-update data loss, and the victim has no way to notice it happened.

With app.models.mixins.OptimisticLockMixin setting SQLAlchemy's version_id_col
to this column, the ORM appends `AND lock_version = <the value it loaded>` to
every UPDATE/DELETE and bumps the column itself. The loser of a race matches no
row, SQLAlchemy raises StaleDataError, and app.main returns 409 so the client
re-reads instead of clobbering.

Named lock_version, NOT version: `boms.version` and `bom_snapshots.version`
already exist and mean a user-chosen business revision. A concurrency token and
an engineering revision must never share a column.

Backfill is safe on a live database: NOT NULL with server_default '1' means
existing rows get 1 without a table rewrite of user data, and any in-flight ORM
session that loaded a row before this ran will simply see lock_version=1.

Idempotent: skips a table that already has the column (every
create_all-bootstrapped database has it from the model).

Revision ID: 064_optimistic_lock_version
Revises: 063_resource_grants
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "064_optimistic_lock_version"
down_revision: str | None = "063_resource_grants"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("parts", "bom_items", "bom_templates")


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing = set(insp.get_table_names())

    for table in _TABLES:
        if table not in existing:
            # Nothing to alter yet; create_all / an earlier migration will make
            # the column from the model definition.
            continue
        if any(c["name"] == "lock_version" for c in insp.get_columns(table)):
            continue
        op.add_column(
            table,
            sa.Column(
                "lock_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing = set(insp.get_table_names())

    for table in _TABLES:
        if table not in existing:
            continue
        if not any(c["name"] == "lock_version" for c in insp.get_columns(table)):
            continue
        op.drop_column(table, "lock_version")

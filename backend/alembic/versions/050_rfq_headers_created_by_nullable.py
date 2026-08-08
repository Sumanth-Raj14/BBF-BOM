"""Drop NOT NULL on rfq_headers.created_by (nullable/SET NULL contradiction).

The model declares `created_by` with `ondelete="SET NULL"` — deleting the
creating user is meant to preserve the RFQ with created_by set to NULL. But
the column was also `nullable=False`, so on a migrated database that FK
action can never actually fire: Postgres raises a NOT NULL violation instead
of nulling the column, and the user delete fails.

A repo-wide audit of ForeignKey(..., ondelete="SET NULL") columns found this
was the only one with an explicit nullable=False; every other SET NULL FK in
the codebase already defaults to nullable=True (SQLAlchemy's Column default),
so no other table needs the same fix.

Revision ID: 050_rfq_headers_created_by_nullable
Revises: 049_restore_check_constraints
"""

from alembic import op
from sqlalchemy import inspect

revision = "050_rfq_headers_created_by_nullable"
down_revision = "049_restore_check_constraints"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite test schema is built by create_all() from the model, which
        # already has nullable=True — nothing to migrate.
        return
    insp = inspect(bind)
    if "rfq_headers" not in insp.get_table_names():
        return
    op.execute('ALTER TABLE "rfq_headers" ALTER COLUMN created_by DROP NOT NULL')


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    insp = inspect(bind)
    if "rfq_headers" not in insp.get_table_names():
        return
    op.execute('ALTER TABLE "rfq_headers" ALTER COLUMN created_by SET NOT NULL')

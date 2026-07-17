"""Fix column name mismatches between models and actual DB schema.

- backup_history: model defines backup_metadata (JSON), DB has metadata
- audit_logs: model defines createdAt (TIMESTAMPTZ), DB has timestamp

Revision ID: 029_fix_column_mismatches
Revises: 028
Create Date: 2026-07-07
"""

from collections.abc import Sequence

from alembic import op

revision: str = "029_fix_column_mismatches"
down_revision: str | None = "028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # backup_history: add backup_metadata column (model uses this name)
    op.execute("""
        DO $$
        BEGIN
            ALTER TABLE backup_history ADD COLUMN "backup_metadata" JSONB DEFAULT '{}'::jsonb;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
    """)

    # audit_logs: add createdAt column (model uses this name)
    op.execute("""
        DO $$
        BEGIN
            ALTER TABLE audit_logs ADD COLUMN "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now();
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.execute('ALTER TABLE backup_history DROP COLUMN IF EXISTS "backup_metadata"')
    op.execute('ALTER TABLE audit_logs DROP COLUMN IF EXISTS "createdAt"')

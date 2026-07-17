"""Create PostgreSQL ENUM types, convert approval columns, drop redundant CHECK constraints

Revision ID: 023
Revises: 022
Create Date: 2026-06-17
"""

from collections.abc import Sequence

from alembic import op

revision: str = "023"
down_revision: str | None = "022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ════════════════════════════════════════════════════════════
    # STEP 1: Create ENUM types (safe: IF NOT EXISTS via DO)
    # ════════════════════════════════════════════════════════════
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE approval_type AS ENUM (
                'ecr', 'eco', 'ncr', 'capa', 'document', 'purchase'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE approval_status AS ENUM (
                'pending', 'approved', 'rejected', 'cancelled'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ════════════════════════════════════════════════════════════
    # STEP 2: Alter columns to use ENUM types
    # ════════════════════════════════════════════════════════════
    op.execute("""
        ALTER TABLE approvals ALTER COLUMN type TYPE approval_type
        USING type::approval_type
    """)

    op.execute("""
        ALTER TABLE approvals ALTER COLUMN "type" SET NOT NULL
    """)

    op.execute("""
        ALTER TABLE approvals ALTER COLUMN status TYPE approval_status
        USING status::approval_status
    """)

    op.execute("""
        ALTER TABLE approvals ALTER COLUMN status SET DEFAULT 'pending'
    """)

    # ════════════════════════════════════════════════════════════
    # STEP 3: Drop redundant CHECK constraints (ENUM replaces them)
    # ════════════════════════════════════════════════════════════
    op.execute("ALTER TABLE approvals DROP CONSTRAINT IF EXISTS ck_approvals_type")
    op.execute("ALTER TABLE approvals DROP CONSTRAINT IF EXISTS ck_approvals_status")


def downgrade() -> None:
    # Restore CHECK constraints
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE approvals ADD CONSTRAINT ck_approvals_type
            CHECK (type IN ('ecr', 'eco', 'ncr', 'capa', 'document', 'purchase'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE approvals ADD CONSTRAINT ck_approvals_status
            CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Revert columns back to String
    op.execute("ALTER TABLE approvals ALTER COLUMN type TYPE VARCHAR")
    op.execute("ALTER TABLE approvals ALTER COLUMN status TYPE VARCHAR")
    op.execute("ALTER TABLE approvals ALTER COLUMN status SET DEFAULT 'pending'")

    # Drop ENUM types
    op.execute("DROP TYPE IF EXISTS approval_status")
    op.execute("DROP TYPE IF EXISTS approval_type")

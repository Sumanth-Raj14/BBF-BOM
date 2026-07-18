"""21 CFR Part 11: electronic-signature table (e_signatures).

Adds `e_signatures`: an immutable, tenant-scoped record produced only by
`app.services.part11_service.sign_action` when a user re-authenticates
(password) to attest to a critical, state-changing action (currently
`eco.approve` / `eco.implement`). No update/delete API is ever exposed for
this table — rows are write-once (INSERT) plus read-only listing.

The audit-trail side of Part 11 (append-only log of the same signing events,
plus general critical mutations) reuses the pre-existing `audit_logs` table
(`app.models.audit_log.AuditLog`) rather than introducing a duplicate
table — it already carries every field the requirement asks for (tenantId,
userId, action, entityType, entityId, changes/payload, createdAt, userIp,
userAgent) and already has no update/delete endpoints.

Being a `TenantAwareMixin` table with a `tenantId` column, `e_signatures`
would, in principle, be exactly the kind of table migration 040's dynamic
`information_schema.columns` scan is meant to protect. But 040's
`upgrade()` only ever runs once, at the moment IT is applied -- and 040 is
always applied to a database BEFORE this migration creates `e_signatures`
(041 `Revises` 040), so that scan can never see this table without a
future re-run/backfill of 040 (see 040's own docstring: "newly added
mixin tables are automatically covered by any future re-run/backfill" --
the operative word being *future*). Relying on 040 alone would silently
leave this Part-11 evidentiary table without the RLS defense-in-depth
backstop that every other tenant table gets.

So this migration installs the same `tenant_isolation` policy directly on
`e_signatures`, gated identically to 040 (Postgres dialect AND
`settings.ENABLE_RLS`, read at migration-apply time -- a no-op on SQLite,
on any other dialect, and on Postgres unless the app has also opted in via
the flag). As with 040, this is a defense-in-depth LAYER only: the
app-layer tenant isolation in `app.core.tenant_events` (auto-filter
SELECT, guard UPDATE/DELETE, auto-populate tenantId on INSERT) already
covers `ESignature` generically via `TenantAwareMixin.__subclasses__()`
and remains the enforcement mechanism of record regardless of this
migration or the RLS flag.

Revision ID: 041_part11_esignatures
Revises: 040_postgres_rls_tenant_isolation
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "041_part11_esignatures"
down_revision: str | None = "040_postgres_rls_tenant_isolation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_POLICY_NAME = "tenant_isolation"
_TABLE_NAME = "e_signatures"


def upgrade() -> None:
    op.create_table(
        "e_signatures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("meaning", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=128), nullable=False),
        sa.Column(
            "signed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_e_signatures_tenantId", "e_signatures", ["tenantId"])
    op.create_index("ix_e_signatures_user_id", "e_signatures", ["user_id"])
    op.create_index(
        "idx_esig_entity", "e_signatures", ["entity_type", "entity_id"]
    )
    op.create_index(
        "idx_esig_tenant_entity",
        "e_signatures",
        ["tenantId", "entity_type", "entity_id"],
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql" and settings.ENABLE_RLS:
        bind.execute(
            sa.text(f'ALTER TABLE "{_TABLE_NAME}" ENABLE ROW LEVEL SECURITY')
        )
        bind.execute(
            sa.text(f'ALTER TABLE "{_TABLE_NAME}" FORCE ROW LEVEL SECURITY')
        )
        bind.execute(
            sa.text(f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{_TABLE_NAME}"')
        )
        bind.execute(
            sa.text(
                f'CREATE POLICY {_POLICY_NAME} ON "{_TABLE_NAME}" '
                f'USING ("tenantId" = current_setting(\'app.current_tenant\', true)::int)'
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Gated on dialect only (not the flag), matching 040's downgrade
        # posture -- always able to clean up whatever upgrade() may have
        # applied, even if the flag's value changed in between.
        bind.execute(
            sa.text(f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{_TABLE_NAME}"')
        )
        bind.execute(
            sa.text(f'ALTER TABLE "{_TABLE_NAME}" NO FORCE ROW LEVEL SECURITY')
        )
        bind.execute(
            sa.text(f'ALTER TABLE "{_TABLE_NAME}" DISABLE ROW LEVEL SECURITY')
        )

    op.drop_index("idx_esig_tenant_entity", table_name="e_signatures")
    op.drop_index("idx_esig_entity", table_name="e_signatures")
    op.drop_index("ix_e_signatures_user_id", table_name="e_signatures")
    op.drop_index("ix_e_signatures_tenantId", table_name="e_signatures")
    op.drop_table("e_signatures")

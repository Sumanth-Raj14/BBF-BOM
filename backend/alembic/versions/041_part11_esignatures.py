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

Being a `TenantAwareMixin` table with a `tenantId` column, `e_signatures` is
automatically picked up by migration 040's dynamic
`information_schema.columns` scan, so it gets the same opt-in Postgres RLS
policy as every other tenant table with no further migration needed here.

Revision ID: 041_part11_esignatures
Revises: 040_postgres_rls_tenant_isolation
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "041_part11_esignatures"
down_revision: str | None = "040_postgres_rls_tenant_isolation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


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


def downgrade() -> None:
    op.drop_index("idx_esig_tenant_entity", table_name="e_signatures")
    op.drop_index("idx_esig_entity", table_name="e_signatures")
    op.drop_index("ix_e_signatures_user_id", table_name="e_signatures")
    op.drop_index("ix_e_signatures_tenantId", table_name="e_signatures")
    op.drop_table("e_signatures")

"""Create bom_share_links — real public read-only BOM share links.

The frontend's "Share BOM" modal handed out
"https://bbox.dev/share/" + Math.random() on a domain the product does not
serve, with expiry and password controls that enforced nothing, because no
share table and no public route existed anywhere. This is the table behind the
honest version: app/models/bom_share.py + app/api/endpoints/bom_shares.py.

`token` is UNIQUE across the whole install, not per tenant: the public resolve
endpoint runs with no tenant context and must identify exactly one row from the
token alone.

Idempotent — skips if the table already exists, so every create_all-bootstrapped
database (all of CI, every dev box) upgrades cleanly. See 058_calendar_events.

Revision ID: 062_bom_share_links
Revises: 061_part_currency
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "062_bom_share_links"
down_revision: str | None = "061_part_currency"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "bom_share_links" in inspect(bind).get_table_names():
        # Already present from a create_all bootstrap — nothing to do.
        return

    op.create_table(
        "bom_share_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "bom_id",
            sa.Integer(),
            sa.ForeignKey("bom_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("password_hash", sa.String()),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True)),
        sa.Column("access_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        # TenantAwareMixin: ondelete="CASCADE", index=True, nullable=False
        # (app/models/mixins.py) — match it exactly or the migrated schema
        # drifts from the model.
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    # index=True on the model columns produces these automatically under
    # create_all; a migration has to state them.
    op.create_index("ix_bom_share_links_token", "bom_share_links", ["token"], unique=True)
    op.create_index("ix_bom_share_links_bom_id", "bom_share_links", ["bom_id"])
    op.create_index("ix_bom_share_links_created_by", "bom_share_links", ["created_by"])
    op.create_index("ix_bom_share_links_tenantId", "bom_share_links", ["tenantId"])
    op.create_index(
        "idx_bom_share_links_tenant_bom", "bom_share_links", ["tenantId", "bom_id"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    if "bom_share_links" not in inspect(bind).get_table_names():
        return
    op.drop_index("idx_bom_share_links_tenant_bom", table_name="bom_share_links")
    op.drop_index("ix_bom_share_links_tenantId", table_name="bom_share_links")
    op.drop_index("ix_bom_share_links_created_by", table_name="bom_share_links")
    op.drop_index("ix_bom_share_links_bom_id", table_name="bom_share_links")
    op.drop_index("ix_bom_share_links_token", table_name="bom_share_links")
    op.drop_table("bom_share_links")

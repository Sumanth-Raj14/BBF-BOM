"""Add bom_closures adjacency-closure table (WS5: fast BOM explosion/where-used)

Adds `bom_closures`: one row per (ancestor_item_id, descendant_item_id) pair
reachable within a single BOM's instance-line tree (`bom_items_master`),
including a self row (ancestor == descendant, depth 0) for every item.
Maintained incrementally by app.services.bom_service's canonical
instance-line CRUD (create_bom_item / update_bom_item / delete_bom_item) —
lets explosion/where-used fetch an entire subtree or ancestor chain in ONE
query instead of walking `parent_item_id` recursively.

Tenant + bom scoped (same P0 leak class as `bom_items_master`): indexed on
(tenantId, bom_id, ancestor_item_id) and (tenantId, bom_id,
descendant_item_id), unique on the full (tenantId, bom_id, ancestor_item_id,
descendant_item_id) tuple.

Revision ID: 039_bom_closure_table
Revises: 038_drop_legacy_purchase_orders
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "039_bom_closure_table"
down_revision: str | None = "038_drop_legacy_purchase_orders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bom_closures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "bom_id",
            sa.Integer(),
            sa.ForeignKey("boms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ancestor_item_id",
            sa.Integer(),
            sa.ForeignKey("bom_items_master.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "descendant_item_id",
            sa.Integer(),
            sa.ForeignKey("bom_items_master.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("depth", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_bom_closures_tenantId", "bom_closures", ["tenantId"])
    op.create_index("ix_bom_closures_bom_id", "bom_closures", ["bom_id"])
    op.create_index(
        "idx_bom_closures_tenant_bom_ancestor",
        "bom_closures",
        ["tenantId", "bom_id", "ancestor_item_id"],
    )
    op.create_index(
        "idx_bom_closures_tenant_bom_descendant",
        "bom_closures",
        ["tenantId", "bom_id", "descendant_item_id"],
    )
    op.create_unique_constraint(
        "uq_bom_closures_tenant_bom_ancestor_descendant",
        "bom_closures",
        ["tenantId", "bom_id", "ancestor_item_id", "descendant_item_id"],
    )


def downgrade() -> None:
    op.drop_table("bom_closures")

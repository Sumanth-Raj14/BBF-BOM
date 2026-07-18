"""Adjacency-closure table for fast multi-level BOM explosion + where-used.

For every (ancestor, descendant) pair reachable within a single BOM's
instance-line tree (`bom_items_master`, linked via `parent_item_id`), this
table holds one row — including a self row (ancestor == descendant, depth 0)
for every item. That lets an entire subtree (explosion) or an entire
ancestor chain (where-used) be fetched in ONE query instead of walking
`parent_item_id` recursively, level by level.

Maintained INCREMENTALLY by app.services.bom_service's canonical
instance-line CRUD (create_bom_item / update_bom_item / delete_bom_item) —
never write to this table directly, and never read it without scoping by
BOTH `tenantId` AND `bom_id` (the same P0 leak class as `bom_items_master`
itself: a bare `descendant_item_id`/`ancestor_item_id` match is not
sufficient, since ids are not globally unique across tenants/BOMs in the
sense that matters — a crafted id could otherwise resolve into another
tenant's or BOM's subtree).
"""

from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BomClosure(Base, TenantAwareMixin):
    __tablename__ = "bom_closures"

    id = Column(Integer, primary_key=True)
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"), nullable=False, index=True)
    ancestor_item_id = Column(
        Integer, ForeignKey("bom_items_master.id", ondelete="CASCADE"), nullable=False
    )
    descendant_item_id = Column(
        Integer, ForeignKey("bom_items_master.id", ondelete="CASCADE"), nullable=False
    )
    depth = Column(Integer, nullable=False, default=0)

    bom = relationship("BOM")

    __table_args__ = (
        Index(
            "idx_bom_closures_tenant_bom_ancestor",
            "tenantId",
            "bom_id",
            "ancestor_item_id",
        ),
        Index(
            "idx_bom_closures_tenant_bom_descendant",
            "tenantId",
            "bom_id",
            "descendant_item_id",
        ),
        UniqueConstraint(
            "tenantId",
            "bom_id",
            "ancestor_item_id",
            "descendant_item_id",
            name="uq_bom_closures_tenant_bom_ancestor_descendant",
        ),
    )

    def __repr__(self):
        return (
            f"<BomClosure bom={self.bom_id} "
            f"{self.ancestor_item_id}->{self.descendant_item_id} d{self.depth}>"
        )

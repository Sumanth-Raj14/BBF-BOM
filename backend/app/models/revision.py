from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    event,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Revision(Base, TenantAwareMixin):
    __tablename__ = "revisions"

    ALLOWED_ENTITY_TYPES = {"part", "project", "bom", "document", "eco", "ncr"}

    id = Column(Integer, primary_key=True)
    entityType = Column(String)  # e.g., "part", "project", "bom"
    entityId = Column(Integer, nullable=False)

    # Revision details
    revisionNumber = Column(String, nullable=False)  # e.g., "A", "B", "C" or "v1.0", "v1.1"
    revisionLabel = Column(String)  # Human-readable label
    description = Column(Text)  # What changed in this revision

    # For BOMs, we might store a snapshot of the BOM structure
    bomSnapshot = Column(
        JSON, nullable=True
    )  # DEPRECATED — use RevisionBomSnapshotItem relationship instead. Will be removed.

    # Author
    createdById = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (Index("idx_revision_entity", "entityType", "entityId"),)

    # Relationships
    createdBy = relationship("User", backref="revisions_created")
    snapshot_items = relationship(
        "RevisionBomSnapshotItem", back_populates="revision", cascade="all, delete-orphan"
    )

    @hybrid_property
    def bomSnapshotComputed(self):
        return [
            {
                "partId": item.partId,
                "partNumber": item.partNumber,
                "partName": item.partName,
                "quantity": item.quantity,
                "referenceDesignator": item.referenceDesignator,
                "unitCost": item.unitCost,
                "extendedCost": item.extendedCost,
                "sortOrder": item.sortOrder,
            }
            for item in self.snapshot_items
        ]

    def __repr__(self):
        return f"<Revision {self.entityType}:{self.entityId} rev {self.revisionNumber}>"


class RevisionBomSnapshotItem(Base, TenantAwareMixin):
    __tablename__ = "revision_bom_snapshot_items"

    id = Column(Integer, primary_key=True)
    revision_id = Column(
        Integer, ForeignKey("revisions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    part_number = Column(String(255))
    part_name = Column(String(255))
    quantity = Column(Numeric(10, 4), default=1)
    reference_designator = Column(String(255))
    unit_cost = Column(Numeric(12, 4))
    extended_cost = Column(Numeric(12, 4))
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    revision = relationship("Revision", back_populates="snapshot_items")

    def __repr__(self):
        return f"<RevisionBomSnapshotItem rev:{self.revision_id} part:{self.part_number}>"


@event.listens_for(Revision, "before_insert")
@event.listens_for(Revision, "before_update")
def validate_revision_entity(mapper, connection, target):
    if target.entityType and target.entityType not in Revision.ALLOWED_ENTITY_TYPES:
        raise ValueError(
            f"Invalid entityType '{target.entityType}'. Must be one of: {Revision.ALLOWED_ENTITY_TYPES}"
        )

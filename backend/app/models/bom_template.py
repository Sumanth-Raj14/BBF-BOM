from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BomTemplate(Base, TenantAwareMixin):
    __tablename__ = "bom_templates"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text)
    bomData = Column(
        JSON, nullable=True
    )  # DEPRECATED — use BomItem relationship instead. Will be removed in future migration.
    partCount = Column(Integer, default=0)
    projectCode = Column(String)  # Optional: link to a project
    createdById = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    createdBy = relationship("User", backref="bom_templates")
    items = relationship("BomItem", back_populates="bom_template", cascade="all, delete-orphan")

    @hybrid_property
    def bomDataComputed(self):
        return [
            {
                "partId": item.partId,
                "partNumber": item.part.partNumber if item.part else None,
                "partName": item.part.name if item.part else None,
                "quantity": item.quantity,
                "referenceDesignator": item.referenceDesignator,
                "notes": item.notes,
                "sortOrder": item.sortOrder,
                "unitCost": item.unitCostSnapshot,
                "extendedCost": item.extendedCost,
            }
            for item in self.items
        ]

    def __repr__(self):
        return f"<BomTemplate {self.name}>"

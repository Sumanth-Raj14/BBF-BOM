from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class EcoChange(Base, TenantAwareMixin):
    __tablename__ = "eco_changes"

    id = Column(Integer, primary_key=True)
    eco_item_id = Column(
        Integer, ForeignKey("eco_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name = Column(String, nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    eco_item = relationship("EcoItem", backref="changes")

    def __repr__(self):
        return f"<EcoChange {self.field_name}>"

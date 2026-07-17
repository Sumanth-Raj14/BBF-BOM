from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class PartCustomField(Base, TenantAwareMixin):
    __tablename__ = "part_custom_fields"

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name = Column(String, nullable=False)
    field_value = Column(Text, nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    part = relationship("Part", backref="custom_fields")

    def __repr__(self):
        return f"<PartCustomField {self.field_name}>"

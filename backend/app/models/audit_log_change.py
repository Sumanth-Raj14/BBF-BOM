from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class AuditLogChange(Base, TenantAwareMixin):
    __tablename__ = "audit_log_changes"

    id = Column(Integer, primary_key=True)
    audit_log_id = Column(
        Integer, ForeignKey("audit_logs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name = Column(String, nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    audit_log = relationship("AuditLog", backref="change_records")

    def __repr__(self):
        return f"<AuditLogChange {self.field_name}>"

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.orm import declared_attr, relationship


class TenantAwareMixin:
    @declared_attr
    def tenantId(self):
        return Column(
            Integer, ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
        )

    @declared_attr
    def tenant(self):
        return relationship("Tenant", foreign_keys=[self.tenantId])

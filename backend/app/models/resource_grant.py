"""Object-level permission grants — "Alice may edit BOM 12, but not BOM 30".

One narrow table, deliberately generic in shape (resourceType/resourceId) so a
second resource type is a string literal rather than a second table, but ONLY
"bom" is wired today (see app/core/object_perms.py). Do not add plumbing for
resource types nobody grants on yet.

Grantee is polymorphic (user | team) with no FK on granteeId — a FK cannot
point at two tables. The API validates the grantee exists in the caller's
tenant before inserting; the tenantId column keeps the row itself scoped.
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin

# view < edit < manage. Ordered so a check is an integer comparison.
GRANT_LEVELS = {"view": 1, "edit": 2, "manage": 3}
GRANTEE_TYPES = ("user", "team")


class ResourceGrant(Base, TenantAwareMixin):
    __tablename__ = "resource_grants"

    id = Column(Integer, primary_key=True)
    resourceType = Column(String(50), nullable=False)  # "bom"
    resourceId = Column(Integer, nullable=False)
    granteeType = Column(String(10), nullable=False)  # "user" | "team"
    granteeId = Column(Integer, nullable=False)
    level = Column(String(10), nullable=False)  # "view" | "edit" | "manage"
    createdById = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "tenantId",
            "resourceType",
            "resourceId",
            "granteeType",
            "granteeId",
            name="uq_resource_grants_grantee",
        ),
        # The only read pattern: "every grant on this object".
        Index("idx_resource_grants_object", "tenantId", "resourceType", "resourceId"),
        CheckConstraint("level IN ('view', 'edit', 'manage')", name="ck_resource_grants_level"),
        CheckConstraint(
            "\"granteeType\" IN ('user', 'team')", name="ck_resource_grants_grantee_type"
        ),
    )

    def __repr__(self):
        return (
            f"<ResourceGrant {self.resourceType}:{self.resourceId} "
            f"{self.granteeType}:{self.granteeId}={self.level}>"
        )

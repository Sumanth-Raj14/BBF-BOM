from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, event
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Comment(Base, TenantAwareMixin):
    __tablename__ = "comments"

    ALLOWED_ENTITY_TYPES = {
        "part",
        "project",
        "po",
        "document",
        "eco",
        "ncr",
        "capa",
        "bom",
        "vendor",
        "work_order",
    }

    id = Column(Integer, primary_key=True)
    content = Column(Text, nullable=False)

    # What the comment is about
    entityType = Column(String)  # e.g., "part", "project", "po", "document"
    entityId = Column(Integer, nullable=False)

    # Author
    userId = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # For threading/replies
    parentId = Column(
        Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Mentions (simplified as text field that can be parsed)
    mentions = Column(Text)  # JSON array of mentioned user IDs or emails

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (Index("idx_comment_entity", "entityType", "entityId"),)

    # Relationships
    user = relationship("User", backref="comments")
    # replies = relationship("Comment", backref="parent")

    def __repr__(self):
        return f"<Comment on {self.entityType}:{self.entityId} by {self.userId}>"


@event.listens_for(Comment, "before_insert")
@event.listens_for(Comment, "before_update")
def validate_comment_entity(mapper, connection, target):
    if target.entityType and target.entityType not in Comment.ALLOWED_ENTITY_TYPES:
        raise ValueError(
            f"Invalid entityType '{target.entityType}'. Must be one of: {Comment.ALLOWED_ENTITY_TYPES}"
        )

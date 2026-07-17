from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class TokenBlacklist(Base, TenantAwareMixin):
    __tablename__ = "token_blacklist"

    id = Column(Integer, primary_key=True)
    jti = Column(String, unique=True, index=True, nullable=False)
    expiresAt = Column(DateTime(timezone=True), nullable=False)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (Index("idx_token_blacklist_expires", "expiresAt"),)

    def __repr__(self):
        return f"<TokenBlacklist {self.id}>"

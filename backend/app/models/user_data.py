from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class UserDataStore(Base, TenantAwareMixin):
    __tablename__ = "user_data_store"
    __table_args__ = (UniqueConstraint("user_id", "data_key", name="uq_user_data_key"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    data_key = Column(String(100), nullable=False)
    data_value = Column(JSON, nullable=False)
    data_version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<UserDataStore {self.id}>"


class UserPreference(Base, TenantAwareMixin):
    __tablename__ = "user_preferences"
    __table_args__ = (UniqueConstraint("user_id", "pref_key", name="uq_user_pref_key"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pref_key = Column(String(100), nullable=False)
    pref_value = Column(Text)
    pref_type = Column(String(20), default="string")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<UserPreference {self.id}>"


class UserChecklistProgress(Base, TenantAwareMixin):
    __tablename__ = "user_checklist_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_checklist"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    completed_items = Column(JSON, nullable=False)
    dismissed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<UserChecklistProgress {self.id}>"


class BomDraft(Base, TenantAwareMixin):
    __tablename__ = "bom_drafts"
    __table_args__ = (UniqueConstraint("user_id", "draft_name", name="uq_user_bom_draft"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    draft_name = Column(String(200), default="default")
    rows_data = Column(JSON, nullable=False)
    conversion_rate = Column(Integer, default=83)
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<BomDraft {self.id}>"


class ScanHistory(Base, TenantAwareMixin):
    __tablename__ = "scan_history"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    barcode_data = Column(Text, nullable=False)
    scan_result = Column(JSON)
    scanned_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ScanHistory {self.id}>"


class SavedSearch(Base, TenantAwareMixin):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    search_name = Column(String(200), nullable=False)
    search_params = Column(JSON, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<SavedSearch {self.id}>"

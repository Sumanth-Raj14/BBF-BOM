from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Document(Base, TenantAwareMixin):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)
    filename = Column(String, nullable=False)
    originalName = Column(String, nullable=False)  # Original filename uploaded
    fileType = Column(String)  # Extension or MIME type
    fileSize = Column(Integer)  # Size in bytes
    filePath = Column(String)  # Path in storage system
    url = Column(String)  # URL to access the file

    # Categorization
    category = Column(String)  # datasheet, cad, drawing, pdf, image, invoice, etc.
    tags = Column(Text)  # Comma-separated tags

    # Relationships
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=True, index=True)
    projectId = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    purchaseOrderId = Column(
        Integer, ForeignKey("po_headers.id", ondelete="CASCADE"), nullable=True, index=True
    )
    uploadedBy = Column(String)  # User who uploaded

    # Access control
    isPublic = Column(Boolean, default=False)
    accessLevel = Column(String, default="private")  # public, private, restricted
    __table_args__ = (
        CheckConstraint(
            "accessLevel IN ('public', 'private', 'restricted')", name="ck_documents_access_level"
        ),
        CheckConstraint(
            "storage_type IN ('s3', 'local', 'azure_blob', 'gcs', 'other')",
            name="ck_documents_storage_type",
        ),
    )

    # Versioning
    version = Column(Integer, default=1)
    isLatest = Column(Boolean, default=True)
    replacesDocumentId = Column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Storage tracking
    storage_type = Column(String(20), default="s3")
    local_fallback_path = Column(Text)
    checksum = Column(String(64))

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    part = relationship("Part", backref="documents")
    project = relationship("Project", backref="documents")
    purchaseOrder = relationship("POHeader", backref="documents")
    # Self-referential for versioning
    # replaces = relationship("Document", remote_side=[id], backref="replacements")

    def __repr__(self):
        return f"<Document {self.filename} v{self.version}>"

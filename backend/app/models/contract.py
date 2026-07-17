from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Contract(Base, TenantAwareMixin):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True)
    contractNumber = Column(String, unique=True, nullable=False)  # CTR-2026-001
    title = Column(String, nullable=False)
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Contract details
    contractType = Column(String)  # "Blanket PO", "Volume Discount", "Long-term Agreement", "NDA"
    effectiveDate = Column(DateTime(timezone=True))
    expirationDate = Column(DateTime(timezone=True))
    autoRenew = Column(Boolean, default=False)

    # Terms
    paymentTerms = Column(String)  # Net 30, Net 60, etc.
    minimumOrderQty = Column(Integer)
    maximumOrderValue = Column(Float)
    currency = Column(String, default="USD")

    # Pricing tiers
    pricingTiers = Column(
        JSON, default=[]
    )  # DEPRECATED — use pricing_tier_items relationship instead. Will be removed after data migration.

    # Parts covered
    partIds = Column(
        JSON, default=[]
    )  # DEPRECATED — use ContractParts relationship instead. Will be removed after data migration.

    # SLA
    leadTimeDays = Column(Integer)
    qualityRequirements = Column(Text)

    # Status
    status = Column(String, default="Draft")  # Draft, Active, Suspended, Expired, Terminated

    # Attachments
    attachments = Column(
        JSON, default=[]
    )  # DEPRECATED — use attachment_items relationship instead. Will be removed after data migration.

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    vendor = relationship("Vendor", backref="contracts")

    parts = relationship("ContractParts", back_populates="contract")
    pricing_tier_items = relationship("ContractPricingTier", back_populates="contract")
    attachment_items = relationship("ContractAttachment", back_populates="contract")

    __table_args__ = (
        Index("idx_contracts_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('Draft', 'Active', 'Suspended', 'Expired', 'Terminated')",
            name="ck_contracts_status",
        ),
        CheckConstraint(
            "contractType IN ('blanket_po', 'volume_discount', 'annual', 'fixed_price', 'other')",
            name="ck_contracts_contract_type",
        ),
    )

    def __repr__(self):
        return f"<Contract {self.contractNumber}: {self.status}>"


class ContractParts(Base, TenantAwareMixin):
    __tablename__ = "contract_parts"

    id = Column(Integer, primary_key=True)
    contract_id = Column(
        Integer, ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contract = relationship("Contract", back_populates="parts")
    part = relationship("Part", backref="contract_parts")

    def __repr__(self):
        return f"<ContractParts contract={self.contract_id} part={self.part_id}>"


class ContractPricingTier(Base, TenantAwareMixin):
    __tablename__ = "contract_pricing_tiers"

    id = Column(Integer, primary_key=True)
    contract_id = Column(
        Integer, ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    min_qty = Column(Integer, nullable=True)
    max_qty = Column(Integer, nullable=True)
    unit_price = Column(Float, nullable=False)
    currency = Column(String(3), default="USD")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contract = relationship("Contract", back_populates="pricing_tier_items")

    def __repr__(self):
        return f"<ContractPricingTier min={self.min_qty} max={self.max_qty} ${self.unit_price}>"


class ContractAttachment(Base, TenantAwareMixin):
    __tablename__ = "contract_attachments"

    id = Column(Integer, primary_key=True)
    contract_id = Column(
        Integer, ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename = Column(String(255))
    file_url = Column(Text)
    file_type = Column(String(50))
    file_size = Column(Integer)
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contract = relationship("Contract", back_populates="attachment_items")
    uploaded_by_user = relationship("User", backref="contract_attachments")

    def __repr__(self):
        return f"<ContractAttachment {self.filename}>"


class PricingAgreement(Base, TenantAwareMixin):
    __tablename__ = "pricing_agreements"

    id = Column(Integer, primary_key=True)
    contractId = Column(
        Integer, ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Price
    agreedPrice = Column(Float, nullable=False)
    currency = Column(String, default="USD")
    effectiveDate = Column(DateTime(timezone=True))
    expirationDate = Column(DateTime(timezone=True))

    # Volume tiers
    volumeTiers = Column(
        JSON, default=[]
    )  # DEPRECATED — use volume_tier_items relationship instead. Will be removed after data migration.

    # Status
    status = Column(String, default="Active")  # Active, Expired, Superseded

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_pricing_agreements_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('Active', 'Expired', 'Superseded')", name="ck_pricing_agreements_status"
        ),
    )

    contract = relationship("Contract", backref="pricing_agreements")
    part = relationship("Part", backref="pricing_agreements")
    vendor = relationship("Vendor", backref="pricing_agreements")
    volume_tier_items = relationship(
        "PricingAgreementVolumeTier", back_populates="pricing_agreement"
    )

    def __repr__(self):
        return f"<PricingAgreement part={self.partId}: ${self.agreedPrice}>"


class PricingAgreementVolumeTier(Base, TenantAwareMixin):
    __tablename__ = "pricing_agreement_volume_tiers"

    id = Column(Integer, primary_key=True)
    pricing_agreement_id = Column(
        Integer, ForeignKey("pricing_agreements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    min_qty = Column(Integer, nullable=True)
    max_qty = Column(Integer, nullable=True)
    unit_price = Column(Float, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pricing_agreement = relationship("PricingAgreement", back_populates="volume_tier_items")

    def __repr__(self):
        return (
            f"<PricingAgreementVolumeTier min={self.min_qty} max={self.max_qty} ${self.unit_price}>"
        )

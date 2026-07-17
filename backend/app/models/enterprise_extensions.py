"""
Multi-Currency & Exchange Rates
Support for global procurement with currency conversion.
"""

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Currency(Base, TenantAwareMixin):
    __tablename__ = "currencies"

    id = Column(Integer, primary_key=True)
    code = Column(String(3), nullable=False)  # unique per tenant
    name = Column(String(100), nullable=False)
    symbol = Column(String(10))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("tenantId", "code", name="uq_currencies_tenant_code"),)

    def __repr__(self):
        return f"<Currency {self.id}>"


class ExchangeRate(Base, TenantAwareMixin):
    __tablename__ = "exchange_rates"

    id = Column(Integer, primary_key=True)
    from_currency = Column(String(3), nullable=False)
    to_currency = Column(String(3), nullable=False)
    rate = Column(Numeric(12, 6), nullable=False)
    effective_date = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(100))

    def __repr__(self):
        return f"<ExchangeRate {self.id}>"

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ComplianceCertificate(Base, TenantAwareMixin):
    __tablename__ = "compliance_certificates"

    id = Column(Integer, primary_key=True)
    certificate_number = Column(String(100), nullable=False)  # unique per tenant
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    compliance_type = Column(String(100), nullable=False)
    issuing_body = Column(String(255))
    issued_date = Column(DateTime(timezone=True))
    expiry_date = Column(DateTime(timezone=True))
    status = Column(String(50), default="active")
    __table_args__ = (
        Index("idx_compliance_certificates_tenant_status", "tenantId", "status"),
        UniqueConstraint(
            "tenantId",
            "certificate_number",
            name="uq_compliance_certificates_tenant_certificate_number",
        ),
        CheckConstraint(
            "status IN ('active', 'expired', 'revoked')", name="ck_compliance_certificates_status"
        ),
    )

    def __repr__(self):
        return f"<ComplianceCertificate {self.id}>"

    document_url = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    part = relationship("Part")


class AutoNumberScheme(Base, TenantAwareMixin):
    __tablename__ = "auto_number_schemes"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(50), nullable=False)

    def __repr__(self):
        return f"<AutoNumberScheme {self.id}>"

    prefix = Column(String(20), nullable=False)
    separator = Column(String(5), default="-")
    next_number = Column(Integer, default=1)
    padding = Column(Integer, default=4)
    suffix = Column(String(20))
    format_example = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CustomAttributeDefinition(Base, TenantAwareMixin):
    __tablename__ = "custom_attribute_definitions"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(50), nullable=False)

    def __repr__(self):
        return f"<CustomAttributeDefinition {self.id}>"

    attribute_name = Column(String(100), nullable=False)
    display_name = Column(String(255))
    attribute_type = Column(String(50), nullable=False)
    is_required = Column(Boolean, default=False)
    is_searchable = Column(Boolean, default=False)
    default_value = Column(Text)
    options = Column(
        JSON
    )  # DEPRECATED — use CustomAttributeOption relationship instead. Will be removed after data migration.
    validation_rules = Column(
        JSON
    )  # DEPRECATED — use CustomAttributeValidationRule relationship instead. Will be removed after data migration.
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Normalized relationships
    option_items = relationship(
        "CustomAttributeOption", back_populates="attribute_definition", cascade="all, delete-orphan"
    )
    validation_rule_items = relationship(
        "CustomAttributeValidationRule",
        back_populates="attribute_definition",
        cascade="all, delete-orphan",
    )

    @hybrid_property
    def options_list(self):
        return [
            {
                "value": o.option_value,
                "label": o.display_label,
                "isDefault": o.is_default,
                "sortOrder": o.sort_order,
            }
            for o in self.option_items
        ]

    @hybrid_property
    def validation_rules_list(self):
        return {r.rule_type: r.rule_value for r in self.validation_rule_items}


class CustomAttributeOption(Base, TenantAwareMixin):
    __tablename__ = "custom_attribute_options"

    id = Column(Integer, primary_key=True)
    attribute_definition_id = Column(
        Integer,
        ForeignKey("custom_attribute_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    option_value = Column(String(255), nullable=False)
    display_label = Column(String(255))
    is_default = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attribute_definition = relationship("CustomAttributeDefinition", back_populates="option_items")

    def __repr__(self):
        return f"<CustomAttributeOption {self.option_value}>"


class CustomAttributeValidationRule(Base, TenantAwareMixin):
    __tablename__ = "custom_attribute_validation_rules"

    id = Column(Integer, primary_key=True)
    attribute_definition_id = Column(
        Integer,
        ForeignKey("custom_attribute_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rule_type = Column(String(50), nullable=False)
    rule_value = Column(Text, nullable=False)
    error_message = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attribute_definition = relationship(
        "CustomAttributeDefinition", back_populates="validation_rule_items"
    )

    def __repr__(self):
        return f"<CustomAttributeValidationRule {self.rule_type}={self.rule_value}>"

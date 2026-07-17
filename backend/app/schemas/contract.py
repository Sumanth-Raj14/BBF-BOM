from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ContractBase(BaseModel):
    contractNumber: str = Field(..., json_schema_extra={"example": "CTR-2026-001"})
    title: str
    vendorId: int

    contractType: Optional[str] = None
    effectiveDate: Optional[datetime] = None
    expirationDate: Optional[datetime] = None
    autoRenew: bool = False

    paymentTerms: Optional[str] = None
    minimumOrderQty: Optional[int] = None
    maximumOrderValue: Optional[float] = None
    currency: str = "USD"

    pricingTiers: Optional[list[dict[str, Any]]] = Field(default_factory=list)
    partIds: Optional[list[int]] = Field(default_factory=list)

    leadTimeDays: Optional[int] = None
    qualityRequirements: Optional[str] = None

    status: str = "Draft"
    attachments: Optional[list[dict[str, Any]]] = Field(default_factory=list)


class ContractCreate(ContractBase):
    pass


class ContractUpdate(BaseModel):
    title: Optional[str] = None
    contractType: Optional[str] = None
    effectiveDate: Optional[datetime] = None
    expirationDate: Optional[datetime] = None
    autoRenew: Optional[bool] = None
    paymentTerms: Optional[str] = None
    minimumOrderQty: Optional[int] = None
    maximumOrderValue: Optional[float] = None
    pricingTiers: Optional[list[dict[str, Any]]] = None
    partIds: Optional[list[int]] = None
    leadTimeDays: Optional[int] = None
    qualityRequirements: Optional[str] = None
    status: Optional[str] = None


class ContractResponse(ContractBase):
    id: int
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PricingAgreementBase(BaseModel):
    contractId: int
    partId: int
    vendorId: int

    agreedPrice: float
    currency: str = "USD"
    effectiveDate: Optional[datetime] = None
    expirationDate: Optional[datetime] = None

    volumeTiers: Optional[list[dict[str, Any]]] = Field(default_factory=list)

    status: str = "Active"


class PricingAgreementCreate(PricingAgreementBase):
    pass


class PricingAgreementUpdate(BaseModel):
    agreedPrice: Optional[float] = None
    effectiveDate: Optional[datetime] = None
    expirationDate: Optional[datetime] = None
    volumeTiers: Optional[list[dict[str, Any]]] = None
    status: Optional[str] = None


class PricingAgreementResponse(PricingAgreementBase):
    id: int
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

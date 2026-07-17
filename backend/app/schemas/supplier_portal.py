from typing import Optional

from pydantic import BaseModel, ConfigDict


class SupplierUserCreate(BaseModel):
    vendorId: int
    email: str
    name: str
    password: str


class SupplierUserResponse(BaseModel):
    id: int
    vendorId: int
    email: str
    name: str
    active: bool = True
    lastLoginAt: Optional[str] = None
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SupplierLoginRequest(BaseModel):
    email: str
    password: str


class SupplierLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: SupplierUserResponse


class SupplierPriceUpdateCreate(BaseModel):
    partId: int
    newPrice: float


class SupplierPriceUpdateResponse(BaseModel):
    id: int
    supplierUserId: int
    partId: int
    oldPrice: float = 0.0
    newPrice: float = 0.0
    status: str
    createdAt: Optional[str] = None
    reviewedAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SupplierPriceUpdateListResponse(BaseModel):
    total: int
    items: list[SupplierPriceUpdateResponse]


# RFQ Schemas


class RfqLineItemCreate(BaseModel):
    part_id: int
    quantity: int
    target_price: Optional[float] = None
    notes: Optional[str] = None


class RfqCreate(BaseModel):
    title: str
    description: Optional[str] = None
    response_deadline: Optional[str] = None
    line_items: list[RfqLineItemCreate] = []


class RfqResponse(BaseModel):
    id: int
    rfq_number: str
    title: str
    description: Optional[str] = None
    status: str
    issue_date: Optional[str] = None
    response_deadline: Optional[str] = None
    awarded_to_vendor_id: Optional[int] = None
    created_by: int
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RfqListResponse(BaseModel):
    total: int
    items: list[RfqResponse]


class RfqRespondRequest(BaseModel):
    line_item_id: int
    quoted_price: float
    quoted_lead_time_days: Optional[int] = None
    notes: Optional[str] = None


class RfqRespondResponse(BaseModel):
    id: int
    rfq_id: int
    line_item_id: int
    quoted_price: float
    quoted_lead_time_days: Optional[int] = None
    status: str = "submitted"
    submitted_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

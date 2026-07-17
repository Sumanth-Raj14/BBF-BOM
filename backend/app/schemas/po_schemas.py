from typing import Optional

from pydantic import BaseModel, ConfigDict


class POLineItemBase(BaseModel):
    itemName: str
    itemDesc: Optional[str] = None
    quantity: int = 1
    itemPrice: float = 0
    amount: float = 0
    gst: float = 0
    total: float = 0


class POLineItemCreate(POLineItemBase):
    pass


class POLineItemResponse(POLineItemBase):
    id: int
    headerId: int

    model_config = ConfigDict(from_attributes=True)


class POHeaderBase(BaseModel):
    poNumber: str
    poDate: Optional[str] = None
    vendorName: str
    project: Optional[str] = None
    poTotal: float = 0
    status: Optional[str] = None


class POHeaderCreate(POHeaderBase):
    items: list[POLineItemCreate] = []


class POHeaderResponse(POHeaderBase):
    id: int
    items: list[POLineItemResponse] = []
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class POListResponse(BaseModel):
    total: int
    items: list[POHeaderResponse]


class POStatsResponse(BaseModel):
    totalPOs: int
    totalValue: float
    totalItems: int
    byStatus: dict
    byProject: dict
    byVendor: dict
    recentPOs: list[POHeaderResponse]

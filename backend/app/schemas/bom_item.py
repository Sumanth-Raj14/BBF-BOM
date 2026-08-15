from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.part_derivative import PartDerivativeResponse


class BomItemBase(BaseModel):
    partId: int
    quantity: int = Field(default=1, ge=1)
    referenceDesignator: Optional[str] = None
    notes: Optional[str] = None
    sortOrder: int = 0
    parentItemId: Optional[int] = None
    unitCostSnapshot: Optional[float] = None
    extendedCost: Optional[float] = None
    # Effectivity — at most one axis is set; null on all five means "always
    # effective". See app.services.bom_effectivity_service for validation.
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    effectiveSerialFrom: Optional[str] = None
    effectiveSerialTo: Optional[str] = None
    effectiveLot: Optional[str] = None


class BomItemCreate(BomItemBase):
    bomTemplateId: int


class BomItemUpdate(BaseModel):
    partId: Optional[int] = None
    quantity: Optional[int] = None
    referenceDesignator: Optional[str] = None
    notes: Optional[str] = None
    sortOrder: Optional[int] = None
    parentItemId: Optional[int] = None
    effectiveFrom: Optional[date] = None
    effectiveTo: Optional[date] = None
    effectiveSerialFrom: Optional[str] = None
    effectiveSerialTo: Optional[str] = None
    effectiveLot: Optional[str] = None


class BomItemResponse(BomItemBase):
    id: int
    bomTemplateId: int
    createdAt: datetime
    # CAD derivative links for this line's part, populated by the
    # /bom-items/{item_id} endpoint (not the list endpoint, to avoid N+1).
    derivatives: list[PartDerivativeResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class BomItemBulkCreate(BaseModel):
    items: list[BomItemCreate]

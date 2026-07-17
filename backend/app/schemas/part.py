from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class PartBase(BaseModel):
    pn: str = Field(..., json_schema_extra={"example": "EL-MCU-STM32H7"})
    name: str = Field(..., json_schema_extra={"example": "MCU Module, STM32H743"})
    description: Optional[str] = None
    rev: str = Field(default="A", json_schema_extra={"example": "B"})
    qty: int = Field(default=1, json_schema_extra={"example": 1})
    uom: str = Field(default="EA", json_schema_extra={"example": "EA"})

    # Classification
    category: Optional[str] = Field(None, json_schema_extra={"example": "Electrical"})
    subCategory: Optional[str] = Field(None, json_schema_extra={"example": "IC"})

    # Vendor/Manufacturer info
    vendor: Optional[str] = Field(None, json_schema_extra={"example": "STMicro"})
    manufacturer: Optional[str] = Field(None, json_schema_extra={"example": "STMicroelectronics"})

    # Cost and timing
    cost: Optional[float] = Field(default=0.0, json_schema_extra={"example": 18.40})
    lead: Optional[int] = Field(default=0, json_schema_extra={"example": 42})
    origin: Optional[str] = Field(None, json_schema_extra={"example": "FR"})

    # Status and lifecycle
    status: Optional[str] = Field(default="Released", json_schema_extra={"example": "Released"})
    assembly: Optional[bool] = Field(default=False, json_schema_extra={"example": False})

    # Technical specs
    barcode: Optional[str] = Field(None, json_schema_extra={"example": "8901234567892"})
    material: Optional[str] = Field(None, json_schema_extra={"example": "Silicon/FR4"})
    weight: Optional[float] = Field(None, json_schema_extra={"example": 5.0})
    dimensions: Optional[str] = Field(None, json_schema_extra={"example": "14 × 14 mm (LQFP-100)"})
    imageUrl: Optional[str] = Field(
        None,
        json_schema_extra={
            "example": "https://placehold.co/120x120/oklch(0.55%200.13%20240)/white?text=MCU"
        },
    )

    # Custom fields
    customFields: Optional[dict[str, Any]] = Field(default_factory=dict)

    # Tags and compliance (as comma-separated strings for simplicity)
    tags: Optional[str] = Field(None, json_schema_extra={"example": "mcu,active,long-lead"})
    compliance: Optional[str] = Field(None, json_schema_extra={"example": "RoHS,REACH"})

    # Cost breakdown
    freight: Optional[float] = Field(default=0.0, json_schema_extra={"example": 1.20})
    tax: Optional[float] = Field(default=0.0, json_schema_extra={"example": 3.40})
    landedCost: Optional[float] = Field(default=0.0, json_schema_extra={"example": 23.00})

    # Country history
    countryHistory: Optional[list[dict[str, Any]]] = Field(default_factory=list)

    # Vendor pricing history
    vendorPrices: Optional[list[dict[str, Any]]] = Field(default_factory=list)

    # CAD reference
    cadUrl: Optional[str] = Field(
        None, json_schema_extra={"example": "cad/ATLAS/Subsystems/EL-MCU-STM32H7.step"}
    )


class PartCreate(PartBase):
    pass


class PartUpdate(BaseModel):
    pn: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    rev: Optional[str] = None
    qty: Optional[int] = None
    uom: Optional[str] = None
    category: Optional[str] = None
    subCategory: Optional[str] = None
    vendor: Optional[str] = None
    manufacturer: Optional[str] = None
    cost: Optional[float] = None
    lead: Optional[int] = None
    origin: Optional[str] = None
    status: Optional[str] = None
    assembly: Optional[bool] = None
    barcode: Optional[str] = None
    material: Optional[str] = None
    weight: Optional[float] = None
    dimensions: Optional[str] = None
    imageUrl: Optional[str] = None
    customFields: Optional[dict[str, Any]] = None
    tags: Optional[str] = None
    compliance: Optional[str] = None
    freight: Optional[float] = None
    tax: Optional[float] = None
    landedCost: Optional[float] = None
    countryHistory: Optional[list[dict[str, Any]]] = None
    vendorPrices: Optional[list[dict[str, Any]]] = None
    cadUrl: Optional[str] = None


class PartResponse(PartBase):
    id: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PartListResponse(BaseModel):
    items: list[PartResponse]
    total: int
    page: int
    per_page: int
    total_pages: int
    has_next: bool
    has_prev: bool

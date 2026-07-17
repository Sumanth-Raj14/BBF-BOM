from typing import Optional

from pydantic import BaseModel, ConfigDict


class ShipmentUpdateBase(BaseModel):
    location: Optional[str] = None
    status: str
    description: Optional[str] = None
    carrierCode: Optional[str] = None
    timestamp: Optional[str] = None


class ShipmentUpdateCreate(ShipmentUpdateBase):
    pass


class ShipmentUpdateResponse(ShipmentUpdateBase):
    id: int
    trackingId: int
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TrackingMilestoneBase(BaseModel):
    stage: str
    label: str
    description: Optional[str] = None
    completed: bool = False
    completedAt: Optional[str] = None
    sortOrder: int = 0
    icon: Optional[str] = None


class TrackingMilestoneCreate(TrackingMilestoneBase):
    pass


class TrackingMilestoneResponse(TrackingMilestoneBase):
    id: int
    trackingId: int

    model_config = ConfigDict(from_attributes=True)


class OrderTrackingBase(BaseModel):
    poHeaderId: int
    currentStage: str = "order_placed"
    carrier: Optional[str] = None
    trackingNumber: Optional[str] = None
    trackingUrl: Optional[str] = None
    estimatedDelivery: Optional[str] = None
    actualDelivery: Optional[str] = None
    shippingAddress: Optional[str] = None
    notes: Optional[str] = None


class OrderTrackingCreate(OrderTrackingBase):
    milestones: list[TrackingMilestoneCreate] = []


class OrderTrackingUpdate(BaseModel):
    currentStage: Optional[str] = None
    carrier: Optional[str] = None
    trackingNumber: Optional[str] = None
    trackingUrl: Optional[str] = None
    estimatedDelivery: Optional[str] = None
    actualDelivery: Optional[str] = None
    shippingAddress: Optional[str] = None
    notes: Optional[str] = None


class OrderTrackingResponse(OrderTrackingBase):
    id: int
    milestones: list[TrackingMilestoneResponse] = []
    shipmentUpdates: list[ShipmentUpdateResponse] = []
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OrderTrackingListResponse(BaseModel):
    total: int
    items: list[OrderTrackingResponse]

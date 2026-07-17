from typing import Optional

from pydantic import BaseModel, ConfigDict


class WebhookSubscriptionBase(BaseModel):
    url: str
    events: str
    secret: Optional[str] = None
    active: bool = True


class WebhookSubscriptionCreate(WebhookSubscriptionBase):
    pass


class WebhookSubscriptionUpdate(BaseModel):
    url: Optional[str] = None
    events: Optional[str] = None
    secret: Optional[str] = None
    active: Optional[bool] = None


class WebhookSubscriptionResponse(WebhookSubscriptionBase):
    id: int
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WebhookDeliveryResponse(BaseModel):
    id: int
    subscriptionId: int
    event: str
    payload: Optional[str] = None
    status: str
    statusCode: Optional[int] = None
    responseText: Optional[str] = None
    retryCount: int = 0
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WebhookTestRequest(BaseModel):
    subscriptionId: int
    event: str = "test.event"
    payload: Optional[str] = None


class WebhookDeliveryListResponse(BaseModel):
    total: int
    items: list[WebhookDeliveryResponse]

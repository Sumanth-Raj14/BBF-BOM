from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.webhook import (
    WebhookDeliveryListResponse,
    WebhookDeliveryResponse,
    WebhookSubscriptionCreate,
    WebhookSubscriptionUpdate,
    WebhookTestRequest,
)
from app.services import webhook_service

router = APIRouter(dependencies=[Depends(get_current_user)])


class WebhookSubscriptionResponse(BaseModel):
    id: int
    url: str
    events: str
    active: bool = True
    createdAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=list[WebhookSubscriptionResponse])
async def list_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = await webhook_service.list_subscriptions(db, current_user)
    return [WebhookSubscriptionResponse(**item) for item in items]


@router.post("", response_model=WebhookSubscriptionResponse)
async def create_subscription(
    data: WebhookSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await webhook_service.create_subscription(db, data.model_dump(), current_user)
    return WebhookSubscriptionResponse(**result)


@router.get("/deliveries", response_model=WebhookDeliveryListResponse)
async def list_deliveries(
    subscription_id: int = None,
    status_filter: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await webhook_service.list_deliveries(db, current_user, subscription_id, status_filter)
    items = [WebhookDeliveryResponse(**item) for item in result["items"]]
    return WebhookDeliveryListResponse(total=result["total"], items=items)


@router.post("/test", response_model=WebhookDeliveryResponse)
async def test_webhook(
    data: WebhookTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await webhook_service.test_webhook(
        db, current_user, data.subscriptionId, data.event, data.payload
    )
    return WebhookDeliveryResponse(**result)


@router.post("/retry/{delivery_id}", response_model=WebhookDeliveryResponse)
async def retry_delivery(
    delivery_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await webhook_service.retry_delivery(db, delivery_id, current_user)
    return WebhookDeliveryResponse(**result)


@router.get("/{sub_id}", response_model=WebhookSubscriptionResponse)
async def get_subscription(
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await webhook_service.get_subscription(db, sub_id, current_user)
    return WebhookSubscriptionResponse(**result)


@router.put("/{sub_id}", response_model=WebhookSubscriptionResponse)
async def update_subscription(
    sub_id: int,
    data: WebhookSubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await webhook_service.update_subscription(
        db, sub_id, data.model_dump(exclude_unset=True), current_user
    )
    return WebhookSubscriptionResponse(**result)


@router.patch("/{sub_id}", response_model=WebhookSubscriptionResponse)
async def patch_subscription(
    sub_id: int,
    data: WebhookSubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await update_subscription(sub_id, data, db, current_user)


@router.delete("/{sub_id}")
async def delete_subscription(
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await webhook_service.delete_subscription(db, sub_id, current_user)
    return {"status": "deleted"}


@router.post("/{subscription_id}/test", response_model=WebhookDeliveryResponse)
async def test_webhook_by_id(
    subscription_id: int,
    data: WebhookTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await webhook_service.test_webhook(
        db, current_user, subscription_id, data.event, data.payload
    )
    return WebhookDeliveryResponse(**result)

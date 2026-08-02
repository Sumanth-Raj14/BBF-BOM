"""Webhook service layer — business logic for webhook subscription management and delivery."""

import hashlib
import ipaddress
import json
import logging
import socket
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.webhook import WebhookDelivery, WebhookSubscription

logger = logging.getLogger(__name__)

# The event-name catalogue. `WebhookSubscription.events` is a free-text
# comma-separated string with no DB or schema constraint (and the UI field is
# free text too), so there was no catalogue to derive from — this is it. Names
# follow the convention already used in the docs and the UI placeholder
# ("part.updated", "bom.created"). Every name here has a real producer; do not
# add one without wiring the emit call, that is the bug this list exists to
# prevent.
EVENTS = (
    "bom.item.created",
    "bom.item.updated",
    "bom.item.deleted",
    "part.created",
    "part.updated",
    "part.deleted",
    "eco.approved",
    "eco.implemented",
)


def is_safe_webhook_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("https",):
            raise HTTPException(status_code=422, detail="Only HTTPS webhook URLs are allowed")
        hostname = parsed.hostname
        if not hostname:
            raise HTTPException(status_code=422, detail="Invalid webhook URL")
        if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"):
            raise HTTPException(status_code=422, detail="Webhook URL must not point to localhost")
        try:
            ip = ipaddress.ip_address(hostname)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_unspecified
            ):
                raise HTTPException(
                    status_code=422,
                    detail="Webhook URL must not point to a private or internal IP address",
                )
        except ValueError:
            resolved = socket.getaddrinfo(hostname, 80)
            for _family, _type, _proto, _canonname, sockaddr in resolved:
                try:
                    ip = ipaddress.ip_address(sockaddr[0])
                    if ip.is_private or ip.is_loopback:
                        raise HTTPException(
                            status_code=422,
                            detail="Webhook URL resolves to a private or internal IP address",
                        )
                except ValueError:
                    pass
        return True
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=422, detail="Could not validate webhook URL")


# ============ Subscription CRUD ============


async def list_subscriptions(db: AsyncSession, current_user: User) -> list[dict]:
    query = select(WebhookSubscription).order_by(WebhookSubscription.createdAt.desc())
    if not current_user.isSuperuser:
        query = query.where(WebhookSubscription.tenantId == current_user.tenantId)
    result = await db.execute(query)
    subs = result.scalars().all()
    return [
        {
            "id": s.id,
            "url": s.url,
            "events": s.events,
            "active": s.active,
            "createdAt": str(s.createdAt) if s.createdAt else None,
        }
        for s in subs
    ]


async def create_subscription(db: AsyncSession, data: dict, current_user: User) -> dict:
    is_safe_webhook_url(data["url"])
    sub = WebhookSubscription(
        url=data["url"],
        events=data.get("events", ""),
        secret=data.get("secret"),
        active=data.get("active", True),
        tenantId=current_user.tenantId,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return {
        "id": sub.id,
        "url": sub.url,
        "events": sub.events,
        "active": sub.active,
        "createdAt": str(sub.createdAt) if sub.createdAt else None,
    }


async def get_subscription(db: AsyncSession, sub_id: int, current_user: User) -> dict:
    result = await db.execute(select(WebhookSubscription).where(WebhookSubscription.id == sub_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if not current_user.isSuperuser and sub.tenantId != current_user.tenantId:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {
        "id": sub.id,
        "url": sub.url,
        "events": sub.events,
        "active": sub.active,
        "createdAt": str(sub.createdAt) if sub.createdAt else None,
    }


async def update_subscription(
    db: AsyncSession, sub_id: int, data: dict, current_user: User
) -> dict:
    result = await db.execute(select(WebhookSubscription).where(WebhookSubscription.id == sub_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if not current_user.isSuperuser and sub.tenantId != current_user.tenantId:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if "url" in data:
        is_safe_webhook_url(data["url"])
    for k, v in data.items():
        if hasattr(sub, k):
            setattr(sub, k, v)
    await db.commit()
    await db.refresh(sub)
    return {
        "id": sub.id,
        "url": sub.url,
        "events": sub.events,
        "active": sub.active,
        "createdAt": str(sub.createdAt) if sub.createdAt else None,
    }


async def delete_subscription(db: AsyncSession, sub_id: int, current_user: User) -> None:
    result = await db.execute(select(WebhookSubscription).where(WebhookSubscription.id == sub_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if not current_user.isSuperuser and sub.tenantId != current_user.tenantId:
        raise HTTPException(status_code=404, detail="Subscription not found")
    await db.delete(sub)
    await db.commit()


# ============ Delivery Management ============


async def list_deliveries(
    db: AsyncSession,
    current_user: User,
    subscription_id: Optional[int] = None,
    status_filter: Optional[str] = None,
) -> dict:
    query = select(WebhookDelivery).join(
        WebhookSubscription, WebhookDelivery.subscriptionId == WebhookSubscription.id
    )
    if not current_user.isSuperuser:
        query = query.where(WebhookSubscription.tenantId == current_user.tenantId)
    if subscription_id:
        query = query.where(WebhookDelivery.subscriptionId == subscription_id)
    if status_filter:
        query = query.where(WebhookDelivery.status == status_filter)
    query = query.order_by(WebhookDelivery.createdAt.desc())
    result = await db.execute(query)
    deliveries = result.scalars().all()
    return {
        "total": len(deliveries),
        "items": [
            {
                "id": d.id,
                "subscriptionId": d.subscriptionId,
                "event": d.event,
                "payload": d.payload,
                "status": d.status,
                "statusCode": d.statusCode,
                "responseText": d.responseText,
                "retryCount": d.retryCount,
                "createdAt": str(d.createdAt) if d.createdAt else None,
            }
            for d in deliveries
        ],
    }


async def _send_webhook(
    sub: WebhookSubscription, payload: str
) -> tuple[Optional[int], Optional[str], str]:
    status_code = None
    response_text = None
    delivery_status = "failed"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            headers = {"Content-Type": "application/json"}
            if sub.secret:
                sig = hashlib.sha256((sub.secret + payload).encode()).hexdigest()
                headers["X-Webhook-Signature"] = sig
            resp = await client.post(sub.url, content=payload, headers=headers)
            status_code = resp.status_code
            response_text = resp.text[:1000]
            if 200 <= resp.status_code < 300:
                delivery_status = "delivered"
    except Exception as e:
        response_text = str(e)
    return status_code, response_text, delivery_status


def _subscribed(sub_events: Optional[str], event: str) -> bool:
    tokens = {t.strip() for t in (sub_events or "").split(",")}
    return event in tokens or "*" in tokens


async def emit_event(db: AsyncSession, event: str, payload: dict, tenant_id: int) -> int:
    """Dispatch a business event to that tenant's matching active subscriptions.

    Call this AFTER the business commit, never before. It is deliberately
    total: a bad URL, a timeout, a dead subscriber, or any internal failure is
    swallowed and logged, so a webhook can never roll back or 500 the mutation
    that triggered it. Returns the number of subscriptions dispatched to.

    Tenancy: subscriptions are selected by explicit `tenantId` equality, so one
    tenant's event can never reach another tenant's subscription.

    ponytail: dispatch is inline (same request, same session, up to 10s per
    subscriber) — same path `test_webhook` already uses. Move it onto the
    existing outbox drainer in main.py if subscriber latency starts showing up
    in mutation response times.
    """
    try:
        result = await db.execute(
            select(WebhookSubscription).where(
                WebhookSubscription.tenantId == tenant_id,
                WebhookSubscription.active.is_(True),
            )
        )
        subs = [s for s in result.scalars().all() if _subscribed(s.events, event)]
        if not subs:
            return 0

        body = json.dumps({"event": event, "data": payload}, default=str)
        # SAVEPOINT: anything that blows up while dispatching unwinds only the
        # delivery rows. A plain db.rollback() here would expire the CALLER's
        # already-committed ORM objects and 500 the request on next attribute
        # access — i.e. the exact failure this helper exists to prevent.
        async with db.begin_nested():
            for sub in subs:
                delivery = WebhookDelivery(
                    subscriptionId=sub.id,
                    event=event,
                    payload=body,
                    status="pending",
                    tenantId=tenant_id,
                )
                db.add(delivery)
                try:
                    is_safe_webhook_url(sub.url)
                except HTTPException as exc:
                    delivery.status = "failed"
                    delivery.responseText = str(exc.detail)
                    continue
                status_code, response_text, delivery_status = await _send_webhook(sub, body)
                delivery.status = delivery_status
                delivery.statusCode = status_code
                delivery.responseText = response_text
        await db.commit()
        return len(subs)
    except Exception:
        logger.exception("Webhook emit failed for event %s (tenant %s)", event, tenant_id)
        return 0


async def test_webhook(
    db: AsyncSession,
    current_user: User,
    subscription_id: int,
    event: str,
    test_payload: Optional[str] = None,
) -> dict:
    result = await db.execute(
        select(WebhookSubscription).where(WebhookSubscription.id == subscription_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if not current_user.isSuperuser and sub.tenantId != current_user.tenantId:
        raise HTTPException(status_code=404, detail="Subscription not found")
    is_safe_webhook_url(sub.url)

    payload = json.dumps({"event": event, "data": test_payload or "test"})
    delivery = WebhookDelivery(
        subscriptionId=sub.id,
        event=event,
        payload=payload,
        status="pending",
    )
    db.add(delivery)
    await db.flush()

    status_code, response_text, delivery_status = await _send_webhook(sub, payload)
    delivery.status = delivery_status
    delivery.statusCode = status_code
    delivery.responseText = response_text
    await db.commit()
    await db.refresh(delivery)

    return {
        "id": delivery.id,
        "subscriptionId": delivery.subscriptionId,
        "event": delivery.event,
        "payload": delivery.payload,
        "status": delivery.status,
        "statusCode": delivery.statusCode,
        "responseText": delivery.responseText,
        "retryCount": delivery.retryCount,
        "createdAt": str(delivery.createdAt) if delivery.createdAt else None,
    }


async def retry_delivery(db: AsyncSession, delivery_id: int, current_user: User) -> dict:
    result = await db.execute(select(WebhookDelivery).where(WebhookDelivery.id == delivery_id))
    delivery = result.scalar_one_or_none()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    sub_result = await db.execute(
        select(WebhookSubscription).where(WebhookSubscription.id == delivery.subscriptionId)
    )
    sub = sub_result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if not current_user.isSuperuser and sub.tenantId != current_user.tenantId:
        raise HTTPException(status_code=404, detail="Delivery not found")
    is_safe_webhook_url(sub.url)

    status_code, response_text, delivery_status = await _send_webhook(sub, delivery.payload)
    delivery.status = delivery_status
    delivery.statusCode = status_code
    delivery.responseText = response_text
    delivery.retryCount += 1
    await db.commit()
    await db.refresh(delivery)

    return {
        "id": delivery.id,
        "subscriptionId": delivery.subscriptionId,
        "event": delivery.event,
        "payload": delivery.payload,
        "status": delivery.status,
        "statusCode": delivery.statusCode,
        "responseText": delivery.responseText,
        "retryCount": delivery.retryCount,
        "createdAt": str(delivery.createdAt) if delivery.createdAt else None,
    }

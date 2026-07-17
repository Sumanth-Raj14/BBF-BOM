"""Email notification service with queue-based delivery.

Processes NotificationQueue entries for email channel.
Supports SMTP with STARTTLS, queue-based retry, and delivery tracking.
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.idempotency import check_idempotency

logger = logging.getLogger(__name__)


async def send_email(
    to: str,
    subject: str,
    body: str,
    html: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> bool:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")
    cfg = settings
    if not cfg.SMTP_HOST or not cfg.SMTP_USER:
        logger.warning("SMTP not configured — skipping email to %s", to)
        return False

    msg = MIMEMultipart("alternative") if html else MIMEText(body, "plain")
    msg["Subject"] = subject
    msg["From"] = cfg.SMTP_FROM
    msg["To"] = to

    if html:
        msg.attach(MIMEText(body, "plain"))
        msg.attach(MIMEText(html, "html"))

    loop = asyncio.get_event_loop()

    def _send():
        try:
            with smtplib.SMTP(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=10) as server:
                if cfg.SMTP_USE_TLS:
                    server.starttls()
                if cfg.SMTP_USER:
                    server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
                server.send_message(msg)
                return True
        except Exception as e:
            logger.error("SMTP send failed: %s", e)
            return False

    return await loop.run_in_executor(None, _send)


async def process_notification_queue(db: AsyncSession, batch_size: int = 50):
    from app.models.notification_queue import NotificationQueue
    from app.models.user import User

    result = await db.execute(
        select(NotificationQueue, User)
        .join(User, NotificationQueue.user_id == User.id)
        .where(
            NotificationQueue.channel == "email",
            not NotificationQueue.is_sent,
        )
        .limit(batch_size)
    )
    rows = result.all()

    for nq, user in rows:
        success = await send_email(
            to=user.email,
            subject=nq.subject,
            body=nq.body or "",
        )
        if success:
            await db.execute(
                update(NotificationQueue).where(NotificationQueue.id == nq.id).values(is_sent=True)
            )
    await db.commit()
    return len(rows)

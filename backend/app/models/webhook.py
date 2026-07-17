from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    event,
)
from sqlalchemy.sql import func

from app.core.encryption import fernet_decrypt, fernet_encrypt
from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class WebhookSubscription(Base, TenantAwareMixin):
    __tablename__ = "webhook_subscriptions"

    id = Column(Integer, primary_key=True)
    url = Column(String, nullable=False)
    events = Column(String, nullable=False)
    secret = Column(String)
    active = Column(Boolean, default=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<WebhookSubscription {self.id}: {self.url}>"


@event.listens_for(WebhookSubscription, "before_insert")
@event.listens_for(WebhookSubscription, "before_update")
def encrypt_webhook_secret(mapper, connection, target):
    if target.secret and not target.secret.startswith("gAAAAA"):
        target.secret = fernet_encrypt(target.secret)


@event.listens_for(WebhookSubscription, "load")
def decrypt_webhook_secret(target, context):
    if target.secret and target.secret.startswith("gAAAAA"):
        target.secret = fernet_decrypt(target.secret)


class WebhookDelivery(Base, TenantAwareMixin):
    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True)
    subscriptionId = Column(
        Integer,
        ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event = Column(String, nullable=False)
    payload = Column(Text)
    status = Column(String, default="pending")
    __table_args__ = (
        Index("idx_webhook_deliveries_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('pending', 'delivered', 'failed', 'retrying')",
            name="ck_webhook_deliveries_status",
        ),
    )
    statusCode = Column(Integer)
    responseText = Column(Text)
    retryCount = Column(Integer, default=0)
    nextRetryAt = Column(DateTime(timezone=True))
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<WebhookDelivery {self.id}: {self.event}>"

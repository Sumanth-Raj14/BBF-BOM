import logging

from sqlalchemy import select

from app.models.integration import IntegrationConnection, IntegrationOutbox

logger = logging.getLogger(__name__)


async def emit_integration_event(db, tenant_id, entity_type, entity_id, action, snapshot):
    """Enqueue outbox rows (one per enabled connection). Never calls external APIs."""
    result = await db.execute(
        select(IntegrationConnection).where(
            IntegrationConnection.tenantId == tenant_id,
            IntegrationConnection.is_enabled.is_(True),
        )
    )
    created = 0
    for conn in result.scalars().all():
        # respect per-tenant enabled entity types (default: all enabled)
        enabled_types = (conn.config or {}).get("enabled_entity_types")
        if enabled_types and entity_type not in enabled_types:
            continue
        db.add(IntegrationOutbox(
            tenantId=tenant_id, provider=conn.provider, entity_type=entity_type,
            entity_id=entity_id, action=action, payload=snapshot or {}, status="pending",
        ))
        created += 1
    return created

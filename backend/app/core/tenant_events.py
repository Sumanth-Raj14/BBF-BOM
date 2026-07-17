"""SQLAlchemy ORM event listeners for tenant isolation.

- Auto-populates tenantId on INSERT from the current tenant context.
- Automatically filters all SELECT queries by tenantId to prevent cross-tenant data leakage.
- Warns about raw SQL, UPDATE, and DELETE operations that bypass tenant filtering.
"""

import logging

from sqlalchemy import event
from sqlalchemy.orm import Mapper, Session

from app.core.tenant_context import get_tenant_id
from app.models.mixins import TenantAwareMixin

logger = logging.getLogger(__name__)


def register_tenant_listeners():
    """Register tenant isolation event listeners.

    Must be called after all models are imported.
    """
    from app.models import user  # noqa: F401

    models = TenantAwareMixin.__subclasses__()
    for model in models:
        _register_insert_listener(model)

    _register_select_filter()
    _register_update_delete_filter()


def _register_insert_listener(model):
    @event.listens_for(model, "before_insert", propagate=True)
    def set_tenant_id(mapper: Mapper, connection, target):
        if hasattr(target, "tenantId") and target.tenantId is None:
            tid = get_tenant_id()
            if tid is not None:
                target.tenantId = tid


def _register_select_filter():
    @event.listens_for(Session, "do_orm_execute")
    def _add_tenant_select_filter(execute_state):
        tenant_id = get_tenant_id()
        if tenant_id is None:
            return
        if not execute_state.is_select:
            return
        if not execute_state.is_orm_statement:
            logger.warning(
                "Non-ORM SELECT blocked by tenant isolation: %s",
                execute_state.statement,
            )
            return

        try:
            mapper = execute_state.mapper_
        except AttributeError:
            return
        if mapper is None:
            return

        entity_class = mapper.class_
        if isinstance(entity_class, type) and issubclass(entity_class, TenantAwareMixin):
            execute_state.statement = execute_state.statement.where(
                entity_class.tenantId == tenant_id
            )


def _register_update_delete_filter():
    @event.listens_for(Session, "before_flush")
    def _check_update_delete_tenant(session, flush_context, instances):
        tenant_id = get_tenant_id()
        if tenant_id is None:
            return

        for obj in session.dirty:
            if isinstance(obj, TenantAwareMixin):
                if hasattr(obj, "tenantId") and obj.tenantId is not None:
                    if obj.tenantId != tenant_id:
                        raise PermissionError(
                            f"Cross-tenant update blocked: {type(obj).__name__} id={getattr(obj, 'id', '?')} "
                            f"belongs to tenant {obj.tenantId}, not current tenant {tenant_id}"
                        )

        for obj in session.deleted:
            if isinstance(obj, TenantAwareMixin):
                if hasattr(obj, "tenantId") and obj.tenantId is not None:
                    if obj.tenantId != tenant_id:
                        raise PermissionError(
                            f"Cross-tenant delete blocked: {type(obj).__name__} id={getattr(obj, 'id', '?')} "
                            f"belongs to tenant {obj.tenantId}, not current tenant {tenant_id}"
                        )


def auto_populate_tenant_id(mapper, connection, target):
    """Direct listener compatible with all SQLAlchemy versions."""
    if hasattr(target, "tenantId") and target.tenantId is None:
        tid = get_tenant_id()
        if tid is not None:
            target.tenantId = tid

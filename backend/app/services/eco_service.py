"""ECO service layer — business logic extracted from endpoint file."""

import logging
from datetime import UTC, datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import cache_get, cache_set
from app.core.idempotency import check_idempotency
from app.core.rbac import ECO_APPROVER_ROLES, user_has_any_role
from app.core.tenant_context import get_tenant_id
from app.integrations.events import emit_integration_event
from app.models.audit_log import AuditLog
from app.models.bom import BOMItem
from app.models.eco import EcoApproval, EcoHeader, EcoItem, EcoItemAttributeChange, EcoNotification
from app.models.notification_queue import NotificationQueue
from app.models.part import Part
from app.models.role import Role
from app.models.user import User
from app.services import webhook_service
from app.services.part11_service import sign_action

logger = logging.getLogger(__name__)

# ECO change-control state machine (R8, surgical): the source status(es) an
# ECO must be in for a given action to be legal. Full multi-approver
# chain + 21 CFR Part 11 e-sign is DEFERRED — this only enforces the
# minimum guardrails: no illegal transitions, no self-approval.
ECO_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "submit": {"draft"},
    "approve": {"review"},
    "reject": {"review"},
    "implement": {"approved"},
    "close": {"implemented"},
}


async def _next_approval_order(db: AsyncSession, eco_id: int) -> int:
    count_result = await db.execute(
        select(func.count()).select_from(EcoApproval).where(EcoApproval.eco_id == eco_id)
    )
    return (count_result.scalar() or 0) + 1


# What each ECO transition says, keyed by action:
#   (EcoNotification.notification_type, email subject prefix, message phrase)
# "close" is deliberately absent — nobody is waiting on a closed ECO.
_ECO_NOTIFY: dict[str, tuple[str, str, str]] = {
    "submit": ("approval_requested", "Approval requested", "is awaiting your approval."),
    "approve": ("approved", "ECO approved", "was approved."),
    "reject": ("rejected", "ECO rejected", "was rejected and returned to draft."),
    "implement": ("implemented", "ECO implemented", "has been implemented."),
}


async def _resolve_eco_approvers(db: AsyncSession, eco: EcoHeader) -> set[int]:
    """The tenant's designated ECO approvers — the same role gate that the
    "approve" action itself enforces (ECO_APPROVER_ROLES), so these are
    exactly the people who *can* act on it. No separate approver model to
    invent: this reuses the existing role/permission setup.
    """
    approvers = await db.execute(
        select(User.id)
        .join(User.roles)
        .where(
            Role.name.in_(ECO_APPROVER_ROLES),
            User.isActive.is_(True),
            User.tenantId == eco.tenantId,
        )
    )
    return set(approvers.scalars().all())


async def _eco_recipients(db: AsyncSession, eco: EcoHeader, action: str) -> set[int]:
    """The humans who actually need to know about this transition.

    Derived from real relationships on the ECO (requester, eco_approvals rows),
    never a broadcast to every user. Scoped to the ECO's own tenant.
    """
    if action == "submit":
        # Whoever is on the hook to approve. perform_eco_action creates a
        # pending eco_approvals row per required approver at submit time, so
        # read that chain; fall back to a fresh role lookup only if none
        # exist (e.g. no admin-level approver was on the tenant at submit).
        pending = await db.execute(
            select(EcoApproval.approver_id).where(
                EcoApproval.eco_id == eco.id, EcoApproval.status == "pending"
            )
        )
        ids = set(pending.scalars().all())
        if ids:
            return ids
        return await _resolve_eco_approvers(db, eco)

    ids = {eco.requested_by}
    if action == "implement":
        # Everyone who signed off also wants to know it actually shipped.
        signed = await db.execute(
            select(EcoApproval.approver_id).where(
                EcoApproval.eco_id == eco.id, EcoApproval.status == "approved"
            )
        )
        ids |= set(signed.scalars().all())
    return ids


async def _notify_eco_transition(
    db: AsyncSession, eco: EcoHeader, action: str, actor_id: int
) -> None:
    """Record in-app notifications and enqueue email for an ECO transition.

    MUST be called AFTER the transition has committed. Every failure is
    swallowed and logged: a notification problem must never roll back or 500
    the ECO operation the user actually asked for. No mail is sent inline —
    rows go on notifications_queue for email_service.process_notification_queue.
    """
    meta = _ECO_NOTIFY.get(action)
    if not meta:
        return
    ntype, subject_prefix, phrase = meta
    try:
        recipients = await _eco_recipients(db, eco, action) - {None, actor_id}
        if not recipients:
            return
        subject = f"{subject_prefix}: {eco.eco_number} — {eco.title}"
        message = f"ECO {eco.eco_number} ({eco.title}) {phrase}"
        for user_id in recipients:
            db.add(
                EcoNotification(
                    eco_id=eco.id,
                    user_id=user_id,
                    notification_type=ntype,
                    message=message,
                    tenantId=eco.tenantId,
                )
            )
            db.add(
                NotificationQueue(
                    user_id=user_id,
                    notification_type="info",
                    subject=subject,
                    body=message,
                    channel="email",
                    priority="high" if action == "submit" else "normal",
                    reference_type="eco",
                    reference_id=eco.id,
                    tenantId=eco.tenantId,
                )
            )
        await db.commit()
    except Exception:
        logger.exception("ECO %s: %s notification dispatch failed", eco.id, action)
        await db.rollback()


async def _log_audit(
    db: AsyncSession, user: User, action: str, entity_id: int, details: Optional[dict] = None
):
    log = AuditLog(
        action=action,
        entityType="eco",
        entityId=entity_id,
        userId=user.id,
        userEmail=user.email,
        changes=details or {},
    )
    db.add(log)


async def create_eco(
    db: AsyncSession,
    current_user: User,
    title: str,
    change_type: str,
    description: Optional[str] = None,
    reason: Optional[str] = None,
    priority: str = "medium",
    impact_level: Optional[str] = None,
    effective_date: Optional[str] = None,
    target_completion_date: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> EcoHeader:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")
    count = await db.execute(select(func.count()).select_from(EcoHeader))
    total = count.scalar() or 0
    eco_number = f"ECO-{datetime.now().strftime('%Y%m%d')}-{total + 1:03d}"
    tid = get_tenant_id()
    eco = EcoHeader(
        eco_number=eco_number,
        title=title,
        description=description,
        reason=reason,
        change_type=change_type,
        priority=priority,
        impact_level=impact_level,
        status="draft",
        requested_by=current_user.id,
        requested_at=datetime.now(UTC),
        tenantId=tid,
    )
    db.add(eco)
    await db.commit()
    await db.refresh(eco)
    await _log_audit(db, current_user, "ECO_CREATED", eco.id, {"eco_number": eco_number})
    await db.commit()
    return eco


async def get_eco_detail(db: AsyncSession, eco_id: int) -> dict:
    cache_key = f"eco:{eco_id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    tid = get_tenant_id()
    eco_stmt = select(EcoHeader).where(EcoHeader.id == eco_id)
    if tid is not None:
        eco_stmt = eco_stmt.where(EcoHeader.tenantId == tid)
    result = await db.execute(eco_stmt)
    eco = result.scalar_one_or_none()
    if not eco:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ECO not found")
    # Eager-load attribute_changes: the response builds it in a comprehension
    # (`for c in i.attribute_changes`), and a lazy load there raises
    # MissingGreenlet under async SQLAlchemy. It only appeared once something
    # expired the identity map — e.g. a GET right after a rolled-back
    # implement — which is exactly when this endpoint is most needed.
    items_stmt = (
        select(EcoItem)
        .where(EcoItem.eco_id == eco_id)
        .options(selectinload(EcoItem.attribute_changes))
    )
    if tid is not None:
        items_stmt = items_stmt.where(EcoItem.tenantId == tid)
    items = await db.execute(items_stmt)
    approvals = await db.execute(
        select(EcoApproval).where(EcoApproval.eco_id == eco_id).order_by(EcoApproval.approval_order)
    )
    notifications = await db.execute(
        select(EcoNotification).where(
            EcoNotification.eco_id == eco_id, EcoNotification.is_read.is_not(True)
        )
    )
    result = {
        "id": eco.id,
        "eco_number": eco.eco_number,
        "title": eco.title,
        "description": eco.description,
        "reason": eco.reason,
        "change_type": eco.change_type,
        "status": eco.status,
        "priority": eco.priority,
        "impact_level": eco.impact_level,
        "requested_by": eco.requested_by,
        "requested_at": eco.requested_at.isoformat() if eco.requested_at else None,
        "effective_date": eco.effective_date.isoformat() if eco.effective_date else None,
        "target_completion_date": eco.target_completion_date.isoformat()
        if eco.target_completion_date
        else None,
        "created_at": eco.created_at.isoformat() if eco.created_at else None,
        "updated_at": eco.updated_at.isoformat() if eco.updated_at else None,
        "items": [
            {
                "id": i.id,
                "part_id": i.part_id,
                "bom_id": i.bom_id,
                "change_type": i.change_type,
                "old_value": i.old_value,
                "new_value": i.new_value,
                "impact_description": i.impact_description,
                "status": i.status,
                "attribute_changes": [
                    {
                        "field_name": c.field_name,
                        "old_value": c.old_value,
                        "new_value": c.new_value,
                        "value_type": c.value_type,
                    }
                    for c in i.attribute_changes
                ],
            }
            for i in items.scalars().all()
        ],
        "approvals": [
            {
                "id": a.id,
                "approver_id": a.approver_id,
                "approval_order": a.approval_order,
                "status": a.status,
                "comments": a.comments,
                "signed_at": a.signed_at.isoformat() if a.signed_at else None,
            }
            for a in approvals.scalars().all()
        ],
        "notifications": [
            {
                "id": n.id,
                "user_id": n.user_id,
                "notification_type": n.notification_type,
                "message": n.message,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifications.scalars().all()
        ],
    }
    await cache_set(cache_key, result, 300)
    return result


# --------------------------------------------------------------------------
# Applying an ECO: turning the paperwork into the actual change.
# --------------------------------------------------------------------------

# Columns an eco_item may NEVER rewrite on its target. EcoItemAttributeChange.
# field_name is user-supplied (add_eco_item derives it from the caller's
# old_value JSON keys), so this is a trust boundary: without the tenantId
# entry an approved ECO could relocate a Part into another tenant, and the
# ORM tenant filter cannot undo that after the fact. Structural columns are
# blocked too — retargeting a row's id/bom_id is a different row, not a change
# to this one. Everything else that is a real mapped column on the target is
# business data an engineering change is entitled to alter.
_ECO_PROTECTED_FIELDS = frozenset(
    {"id", "tenantId", "bom_id", "eco_id", "created_at", "createdAt", "updated_at", "updatedAt"}
)


def _tenant_scoped(stmt, model, tid: Optional[int]):
    """Mirror the explicit tenant predicate the rest of this module applies.

    tenant_events already auto-filters select(), but every other lookup here
    states it outright; a belt-and-braces predicate on the rows an ECO is
    about to *mutate* is the cheapest place to keep that habit.
    """
    return stmt if tid is None else stmt.where(model.tenantId == tid)


def _apply_field(target, field_name: str, raw: Optional[str]) -> None:
    """Set one recorded attribute change onto a Part / BOMItem.

    EcoItemAttributeChange stores values as Text, so the string has to be
    coerced back to the column's Python type — writing "5" into a Numeric
    quantity would otherwise land a string in the DB (SQLite accepts it) and
    blow up later arithmetic. Anything unrecognised raises: the caller turns
    that into a full rollback, which is the whole point of this being strict.
    """
    column = sa_inspect(type(target)).columns.get(field_name)
    if column is None or field_name in _ECO_PROTECTED_FIELDS:
        raise ValueError(
            f"'{field_name}' is not a field an ECO can change on {type(target).__name__}"
        )
    if raw is None:
        setattr(target, field_name, None)
        return
    try:
        py_type = column.type.python_type
    except NotImplementedError:  # JSON and friends have no single Python type
        raise ValueError(f"Field '{field_name}' has a type an ECO cannot set from text")
    if py_type is bool:
        value = str(raw).strip().lower() in ("true", "1", "yes", "y")
    elif py_type in (int, float, Decimal):
        value = py_type(raw)  # ValueError/InvalidOperation on junk -> rollback
    elif py_type is str:
        value = raw
    else:
        raise ValueError(f"Field '{field_name}' has a type an ECO cannot set from text")
    setattr(target, field_name, value)


def _apply_changes(target, changes: list[EcoItemAttributeChange], required: bool = True) -> dict:
    if required and not changes:
        raise ValueError("no attribute changes recorded — there is nothing to apply")
    applied = {}
    for change in changes:
        _apply_field(target, change.field_name, change.new_value)
        applied[change.field_name] = change.new_value
    return applied


async def _apply_eco_items(db: AsyncSession, eco: EcoHeader, tid: Optional[int], now) -> list[dict]:
    """Apply every eco_item's change_type to its real target, for real.

    Runs INSIDE perform_eco_action's transaction and BEFORE its commit, so a
    failure on item N leaves items 1..N-1 *and* the status flip uncommitted —
    a half-applied ECO is impossible. Returns a per-item summary for the audit
    log. Raises ValueError on anything it cannot apply.

    Which row an item targets: bom_id set -> that BOM's line for this part;
    bom_id null -> the part master itself.
    """
    items = (
        await db.execute(
            _tenant_scoped(select(EcoItem).where(EcoItem.eco_id == eco.id), EcoItem, tid).order_by(
                EcoItem.id
            )
        )
    ).scalars().all()

    applied: list[dict] = []
    for item in items:
        # Second line of defence behind the status guard in perform_eco_action:
        # an item already marked implemented is never applied twice.
        if item.status == "implemented":
            continue
        # Explicit query, not item.attribute_changes: the relationship is lazy
        # and would raise MissingGreenlet on the async session.
        changes = (
            await db.execute(
                select(EcoItemAttributeChange).where(
                    EcoItemAttributeChange.eco_item_id == item.id
                )
            )
        ).scalars().all()
        ct = item.change_type

        if item.bom_id is None:
            part = (
                await db.execute(_tenant_scoped(select(Part).where(Part.id == item.part_id), Part, tid))
            ).scalar_one_or_none()
            if part is None:
                raise ValueError(f"eco_item {item.id}: part {item.part_id} not found")
            if ct == "delete":
                # An ECO never hard-deletes a part master. BOM lines, POs and
                # inventory all FK to parts with ondelete=CASCADE, so a DELETE
                # here would silently take live records with it. Obsoleting is
                # what "remove this part" means under change control.
                detail = {"status": "Obsolete"}
                part.status = "Obsolete"
            else:
                # add / modify / replace on the part master are all "write the
                # recorded new values". `add` is allowed to have none: the part
                # row already exists (eco_items.part_id is a NOT NULL FK), so an
                # add with nothing recorded is legitimately a no-op.
                detail = _apply_changes(part, changes, required=ct != "add")
            target_desc = {"part_id": part.id}
        else:
            line = (
                await db.execute(
                    _tenant_scoped(
                        select(BOMItem).where(
                            BOMItem.bom_id == item.bom_id, BOMItem.part_id == item.part_id
                        ),
                        BOMItem,
                        tid,
                    )
                )
            ).scalars().first()
            if ct == "add":
                if line is not None:
                    raise ValueError(
                        f"eco_item {item.id}: BOM {item.bom_id} already contains part "
                        f"{item.part_id} — cannot add it again"
                    )
                # tenantId passed EXPLICITLY: ambient context alone has produced
                # NOT NULL tenantId failures on the HTTP path before.
                line = BOMItem(
                    bom_id=item.bom_id,
                    part_id=item.part_id,
                    quantity=item.affected_quantity or 1,
                    tenantId=item.tenantId or tid,
                )
                db.add(line)
                detail = {"created": True, **_apply_changes(line, changes, required=False)}
            elif line is None:
                raise ValueError(
                    f"eco_item {item.id}: BOM {item.bom_id} has no line for part {item.part_id}"
                )
            elif ct == "delete":
                # ORM delete (not a Core bulk delete) so the tenant flush guard
                # still sees it.
                await db.delete(line)
                detail = {"deleted": True}
            else:
                # modify / replace. A "replace" records part_id among its
                # attribute changes — swapping the line's part IS the replace,
                # so it needs no separate branch. A bad new part_id trips the FK
                # on flush below and rolls the whole ECO back.
                detail = _apply_changes(line, changes)
            target_desc = {"bom_id": item.bom_id, "part_id": item.part_id}

        item.status = "implemented"
        item.implemented_at = now
        applied.append({"eco_item_id": item.id, "change_type": ct, **target_desc, "fields": detail})

    # Surface FK / NOT NULL / type failures HERE, inside the caller's try, and
    # not at the far-away commit where they would escape as a raw 500.
    await db.flush()
    return applied


async def perform_eco_action(
    db: AsyncSession,
    current_user: User,
    eco_id: int,
    action: str,
    comments: Optional[str] = None,
    digital_signature: Optional[str] = None,
    password: Optional[str] = None,
    signature_meaning: Optional[str] = None,
) -> dict:
    tid = get_tenant_id()
    eco_stmt = select(EcoHeader).where(EcoHeader.id == eco_id)
    if tid is not None:
        eco_stmt = eco_stmt.where(EcoHeader.tenantId == tid)
    result = await db.execute(eco_stmt)
    eco = result.scalar_one_or_none()
    if not eco:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ECO not found")
    valid_actions = ["submit", "approve", "reject", "implement", "close"]
    if action not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action. Must be one of: {valid_actions}",
        )
    # R8 guardrail: reject illegal state transitions (e.g. approving an ECO
    # that isn't in review/submitted status).
    allowed_source = ECO_ALLOWED_TRANSITIONS[action]
    if eco.status not in allowed_source:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot {action} ECO from status '{eco.status}'. "
                f"ECO must be in one of: {sorted(allowed_source)}"
            ),
        )
    now = datetime.now(UTC)
    applied: list[dict] = []  # what "implement" actually changed, for the audit row
    if action == "submit":
        eco.status = "review"
        # R8: create the actual approval chain here — a pending eco_approvals
        # row per required approver — so approvals are never empty and
        # notification recipients don't have to fall back to a role query.
        # Skip approvers who already have an open pending row for this ECO
        # (a reject->resubmit cycle reuses the still-open approval instead of
        # piling up duplicates).
        approver_ids = await _resolve_eco_approvers(db, eco)
        existing_pending = await db.execute(
            select(EcoApproval.approver_id).where(
                EcoApproval.eco_id == eco.id, EcoApproval.status == "pending"
            )
        )
        already_pending = set(existing_pending.scalars().all())
        next_order = await _next_approval_order(db, eco.id)
        for approver_id in approver_ids - already_pending:
            db.add(
                EcoApproval(
                    eco_id=eco.id,
                    approver_id=approver_id,
                    approval_order=next_order,
                    status="pending",
                    tenantId=tid,
                )
            )
            next_order += 1
    elif action == "approve":
        # R8 guardrail: forbid self-approval — the acting user must not be
        # the ECO creator/requester.
        if eco.requested_by == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ECO creator/requester cannot approve their own ECO",
            )
        # R8 guardrail: designated-approver RBAC — the general
        # `require_engineering` gate on the endpoint is not sufficient here;
        # any engineer can create/submit an ECO, but only a designated
        # approver (admin-level role) may approve one.
        if not await user_has_any_role(db, current_user, ECO_APPROVER_ROLES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User lacks the designated ECO-approver role",
            )
        # 21 CFR Part 11: approving an ECO requires a password-re-authenticated
        # electronic signature, recorded (with an audit-log entry) BEFORE any
        # state mutation below. A missing/invalid password raises
        # HTTPException(401) here and the ECO does not transition.
        await sign_action(
            db,
            current_user,
            password,
            action="eco.approve",
            entity_type="eco",
            entity_id=eco.id,
            meaning=signature_meaning or comments or f"Approval of ECO {eco.eco_number}",
            content={"eco_id": eco.id, "eco_number": eco.eco_number, "status": eco.status},
        )
        eco.status = "approved"
        eco.approved_by = current_user.id
        eco.approved_at = now
        # R8 guardrail: record the approval on EcoApproval (not just the
        # header). submit created a pending row for this approver — fill
        # that in rather than leaving it dangling forever; fall back to
        # inserting a fresh row (approval_order derived from existing
        # approvals, never hardcoded) for legacy ECOs or an approver acting
        # outside the original chain.
        pending_row = await db.execute(
            select(EcoApproval).where(
                EcoApproval.eco_id == eco.id,
                EcoApproval.approver_id == current_user.id,
                EcoApproval.status == "pending",
            )
        )
        approval = pending_row.scalar_one_or_none()
        if approval:
            approval.status = "approved"
            approval.comments = comments
            approval.signed_at = now
            approval.digital_signature = digital_signature
        else:
            db.add(
                EcoApproval(
                    eco_id=eco.id,
                    approver_id=current_user.id,
                    approval_order=await _next_approval_order(db, eco.id),
                    status="approved",
                    comments=comments,
                    signed_at=now,
                    digital_signature=digital_signature,
                    tenantId=tid,
                )
            )
    elif action == "reject":
        eco.status = "draft"
    elif action == "implement":
        # 21 CFR Part 11: implementing an ECO likewise requires a
        # password-re-authenticated electronic signature before the state
        # transition — same guardrail shape as "approve" above.
        await sign_action(
            db,
            current_user,
            password,
            action="eco.implement",
            entity_type="eco",
            entity_id=eco.id,
            meaning=signature_meaning or comments or f"Implementation of ECO {eco.eco_number}",
            content={"eco_id": eco.id, "eco_number": eco.eco_number, "status": eco.status},
        )
        # THE change. Everything above this line is paperwork; this is where an
        # approved revision actually reaches the parts and BOM lines.
        #
        # Idempotency: the ECO_ALLOWED_TRANSITIONS guard above already rejects
        # implement unless status == "approved", so a second implement 409s
        # before reaching here and nothing can be double-applied.
        #
        # Atomicity: _apply_eco_items shares this function's transaction and
        # nothing is committed until below, so any failure rolls back BOTH the
        # partially-applied items and the status flip. A half-applied ECO is
        # worse than a failed one.
        # Read anything we need for logging BEFORE the rollback: rollback()
        # expires every instance in the session, so touching eco.id afterwards
        # triggers an implicit refresh and raises MissingGreenlet — masking the
        # real error with a confusing async-plumbing one.
        _eco_id_for_log = eco.id
        try:
            applied = await _apply_eco_items(db, eco, tid, now)
        except Exception as exc:
            detail = str(exc)
            await db.rollback()
            logger.exception(
                "ECO %s: implementation failed and was rolled back", _eco_id_for_log
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"ECO not implemented — no changes were applied: {detail}",
            )
        eco.status = "implemented"
        eco.implemented_by = current_user.id
        eco.implemented_at = now
    elif action == "close":
        eco.status = "closed"
    if comments:
        eco.description = (eco.description or "") + f"\n[{now.isoformat()}] {comments}"
    await emit_integration_event(
        db, current_user.tenantId, "eco", eco.id, "status_change",
        {"ref": eco.eco_number, "status": eco.status},
    )
    await db.commit()
    # entityType stays "eco" (already in AuditLog.ALLOWED_ENTITY_TYPES) — this
    # audit write happens AFTER the business change is committed, so an
    # unlisted type would 500 the request while the change stayed applied.
    audit_details: dict = {"status": eco.status}
    if applied:
        audit_details["applied"] = applied
    await _log_audit(db, current_user, f"ECO_{action.upper()}", eco_id, audit_details)
    await db.commit()
    if action in ("approve", "implement"):
        # eco.status is exactly "approved"/"implemented" here -> eco.approved / eco.implemented
        await webhook_service.emit_event(
            db,
            f"eco.{eco.status}",
            {"eco_id": eco.id, "eco_number": eco.eco_number, "status": eco.status},
            current_user.tenantId,
        )
    # State change is already committed above — notifications are best-effort
    # and can never roll it back (see _notify_eco_transition).
    await _notify_eco_transition(db, eco, action, current_user.id)
    return {"eco_id": eco_id, "action": action, "status": eco.status, "timestamp": now.isoformat()}


async def add_eco_item(
    db: AsyncSession,
    eco_id: int,
    part_id: int,
    change_type: str,
    bom_id: Optional[int] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    impact_description: Optional[str] = None,
) -> EcoItem:
    tid = get_tenant_id()
    eco_stmt = select(EcoHeader).where(EcoHeader.id == eco_id)
    if tid is not None:
        eco_stmt = eco_stmt.where(EcoHeader.tenantId == tid)
    result = await db.execute(eco_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ECO not found")
    item = EcoItem(
        eco_id=eco_id,
        part_id=part_id,
        bom_id=bom_id,
        change_type=change_type,
        old_value=old_value,
        new_value=new_value,
        impact_description=impact_description,
        tenantId=tid,
    )
    db.add(item)
    await db.flush()
    if old_value:
        for field, value in old_value.items():
            db.add(
                EcoItemAttributeChange(
                    eco_item_id=item.id,
                    field_name=field,
                    old_value=str(value) if value is not None else None,
                    new_value=str(new_value.get(field))
                    if new_value and new_value.get(field) is not None
                    else None,
                    value_type=type(value).__name__ if value is not None else "string",
                )
            )
    await db.commit()
    await db.refresh(item)
    return item


async def get_eco_impact(db: AsyncSession, eco_id: int) -> dict:
    tid = get_tenant_id()
    eco_stmt = select(EcoHeader).where(EcoHeader.id == eco_id)
    if tid is not None:
        eco_stmt = eco_stmt.where(EcoHeader.tenantId == tid)
    result = await db.execute(eco_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ECO not found")
    items_stmt = select(EcoItem).where(EcoItem.eco_id == eco_id)
    if tid is not None:
        items_stmt = items_stmt.where(EcoItem.tenantId == tid)
    items = await db.execute(items_stmt)
    item_list = items.scalars().all()
    return {
        "eco_id": eco_id,
        "affected_parts": len(set(i.part_id for i in item_list if i.part_id)),
        "affected_boms": len(set(i.bom_id for i in item_list if i.bom_id)),
        "affected_items": len(item_list),
    }

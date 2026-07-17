from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.ai_models import ApprovalAutomationRule
from app.models.approval import Approval
from app.models.user import User
from app.schemas.ai_schemas import (
    ApprovalAutomationRuleCreate,
    ApprovalAutomationRuleListResponse,
    ApprovalAutomationRuleResponse,
    ApprovalAutomationRuleUpdate,
    ApprovalEvaluateRequest,
    ApprovalEvaluateResponse,
)

router = APIRouter()


def _evaluate_condition(entity_value, operator: str, condition_value: str) -> bool:
    try:
        if operator == "eq":
            return str(entity_value) == condition_value
        elif operator == "ne":
            return str(entity_value) != condition_value
        elif operator == "lt":
            return float(entity_value) < float(condition_value)
        elif operator == "lte":
            return float(entity_value) <= float(condition_value)
        elif operator == "gt":
            return float(entity_value) > float(condition_value)
        elif operator == "gte":
            return float(entity_value) >= float(condition_value)
        elif operator == "contains":
            return condition_value.lower() in str(entity_value).lower()
        elif operator == "in":
            values = [v.strip() for v in condition_value.split(",")]
            return str(entity_value) in values
        elif operator == "not_in":
            values = [v.strip() for v in condition_value.split(",")]
            return str(entity_value) not in values
    except (ValueError, TypeError):
        return False
    return False


def _rule_to_response(r) -> ApprovalAutomationRuleResponse:
    return ApprovalAutomationRuleResponse(
        id=r.id,
        name=r.name,
        description=r.description,
        entityType=(r.conditions or {}).get("entityType") if r.conditions else None,
        conditionField=(r.conditions or {}).get("field") if r.conditions else None,
        conditionOperator=(r.conditions or {}).get("operator") if r.conditions else None,
        conditionValue=(r.conditions or {}).get("value") if r.conditions else None,
        action=(r.actions or {}).get("action") if r.actions else None,
        isActive=r.active,
        priority=(r.conditions or {}).get("priority", 0) if r.conditions else 0,
        createdAt=str(r.createdAt) if r.createdAt else None,
        updatedAt=None,
    )


@router.get("/rules", response_model=ApprovalAutomationRuleListResponse)
async def list_rules(
    entityType: Optional[str] = None,
    isActive: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ApprovalAutomationRule)
    result = await db.execute(query)
    rules = result.scalars().all()

    filtered = []
    for r in rules:
        conds = r.conditions or {}
        if entityType and conds.get("entityType") != entityType:
            continue
        if isActive is not None and r.active != isActive:
            continue
        filtered.append(r)

    total = len(filtered)
    paginated = filtered[skip : skip + limit]

    return ApprovalAutomationRuleListResponse(
        total=total,
        items=[_rule_to_response(r) for r in paginated],
    )


@router.post(
    "/rules",
    response_model=ApprovalAutomationRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_rule(
    rule: ApprovalAutomationRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conds = {
        "entityType": rule.entityType,
        "field": rule.conditionField,
        "operator": rule.conditionOperator,
        "value": rule.conditionValue,
        "priority": rule.priority if hasattr(rule, "priority") else 0,
    }
    acts = {"action": rule.action}
    db_rule = ApprovalAutomationRule(
        name=rule.name,
        description=rule.description,
        conditions=conds,
        actions=acts,
        active=rule.isActive if hasattr(rule, "isActive") else True,
        tenantId=current_user.tenantId,
    )
    db.add(db_rule)
    await db.commit()
    await db.refresh(db_rule)
    return _rule_to_response(db_rule)


@router.get("/rules/{rule_id}", response_model=ApprovalAutomationRuleResponse)
async def get_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ApprovalAutomationRule).where(ApprovalAutomationRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return _rule_to_response(rule)


@router.put("/rules/{rule_id}", response_model=ApprovalAutomationRuleResponse)
async def update_rule(
    rule_id: int,
    update: ApprovalAutomationRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ApprovalAutomationRule).where(ApprovalAutomationRule.id == rule_id)
    )
    db_rule = result.scalar_one_or_none()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    update_data = update.model_dump(exclude_unset=True)
    conds = dict(db_rule.conditions or {})
    acts = dict(db_rule.actions or {})

    if "entityType" in update_data:
        conds["entityType"] = update_data.pop("entityType")
    if "conditionField" in update_data:
        conds["field"] = update_data.pop("conditionField")
    if "conditionOperator" in update_data:
        conds["operator"] = update_data.pop("conditionOperator")
    if "conditionValue" in update_data:
        conds["value"] = update_data.pop("conditionValue")
    if "priority" in update_data:
        conds["priority"] = update_data.pop("priority")
    if "action" in update_data:
        acts["action"] = update_data.pop("action")
    if "isActive" in update_data:
        db_rule.active = update_data.pop("isActive")

    db_rule.conditions = conds
    db_rule.actions = acts

    for field, value in update_data.items():
        if hasattr(db_rule, field):
            setattr(db_rule, field, value)

    await db.commit()
    await db.refresh(db_rule)
    return _rule_to_response(db_rule)


@router.patch("/rules/{rule_id}", response_model=ApprovalAutomationRuleResponse)
async def patch_rule(
    rule_id: int,
    update: ApprovalAutomationRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await update_rule(rule_id, update, db, current_user)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ApprovalAutomationRule).where(ApprovalAutomationRule.id == rule_id)
    )
    db_rule = result.scalar_one_or_none()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.delete(db_rule)
    await db.commit()
    return None


@router.post("/evaluate", response_model=ApprovalEvaluateResponse)
async def evaluate_approval(
    req: ApprovalEvaluateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Approval).where(Approval.id == req.approvalId))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")

    rules_result = await db.execute(select(ApprovalAutomationRule))
    all_rules = rules_result.scalars().all()

    matched_rules = []
    for rule in all_rules:
        if not rule.active:
            continue
        conds = rule.conditions or {}
        if conds.get("entityType") != approval.type:
            continue
        field_value = getattr(approval, conds.get("field", ""), None)
        if field_value is None:
            continue
        if _evaluate_condition(field_value, conds.get("operator", ""), conds.get("value", "")):
            matched_rules.append(rule)

    if matched_rules:
        best_rule = matched_rules[0]
        return ApprovalEvaluateResponse(
            approvalId=approval.id,
            matched=True,
            matchedRules=[_rule_to_response(r) for r in matched_rules],
            action=(best_rule.actions or {}).get("action"),
            message=f"Matched {len(matched_rules)} rule(s). Recommended action: {(best_rule.actions or {}).get('action')}",
        )

    return ApprovalEvaluateResponse(
        approvalId=approval.id,
        matched=False,
        matchedRules=[],
        action=None,
        message="No automation rules matched this approval",
    )


@router.post("/evaluate/{approval_id}", response_model=ApprovalEvaluateResponse)
async def evaluate_approval_by_id(
    approval_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")

    rules_result = await db.execute(select(ApprovalAutomationRule))
    all_rules = rules_result.scalars().all()

    matched_rules = []
    for rule in all_rules:
        if not rule.active:
            continue
        conds = rule.conditions or {}
        if conds.get("entityType") != approval.type:
            continue
        field_value = getattr(approval, conds.get("field", ""), None)
        if field_value is None:
            continue
        if _evaluate_condition(field_value, conds.get("operator", ""), conds.get("value", "")):
            matched_rules.append(rule)

    if matched_rules:
        best_rule = matched_rules[0]
        return ApprovalEvaluateResponse(
            approvalId=approval.id,
            matched=True,
            matchedRules=[_rule_to_response(r) for r in matched_rules],
            action=(best_rule.actions or {}).get("action"),
            message=f"Matched {len(matched_rules)} rule(s). Recommended action: {(best_rule.actions or {}).get('action')}",
        )

    return ApprovalEvaluateResponse(
        approvalId=approval.id,
        matched=False,
        matchedRules=[],
        action=None,
        message="No automation rules matched this approval",
    )

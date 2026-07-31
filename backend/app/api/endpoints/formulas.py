"""Calculated/formula custom-attribute evaluation (Track D)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.formula_service import FormulaError, compute_custom_attribute, evaluate_formula

router = APIRouter()


class FormulaEvaluateRequest(BaseModel):
    formula: str
    context: dict[str, float] = Field(default_factory=dict)


class ComputeAttributeRequest(BaseModel):
    entity_type: str
    entity_id: Optional[int] = None
    context: Optional[dict[str, float]] = None


@router.post("/evaluate")
async def evaluate(
    body: FormulaEvaluateRequest,
    current_user: User = Depends(get_current_user),
):
    """Evaluate an arbitrary arithmetic formula against a supplied numeric
    context. Not tied to any stored CustomAttributeDefinition -- useful for
    validating/previewing a formula before saving it."""
    try:
        value = evaluate_formula(body.formula, body.context)
    except FormulaError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"formula": body.formula, "value": value}


@router.post("/{attribute_definition_id}/compute")
async def compute(
    attribute_definition_id: int,
    body: ComputeAttributeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compute a stored computed/formula CustomAttributeDefinition's value for
    one entity (e.g. entity_type='part', entity_id=<part id>)."""
    return await compute_custom_attribute(
        db,
        current_user.tenantId,
        attribute_definition_id,
        body.entity_type,
        body.entity_id,
        body.context,
    )

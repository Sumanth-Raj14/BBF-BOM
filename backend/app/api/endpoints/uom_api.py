"""Units of Measure + conversion API.

Same shape as the exchange-rate endpoints in enterprise_ext_api.py
(GET list, GET .../convert) — see app/services/uom_service.py for the
conversion rules (refuses cross-dimension and unknown-unit conversions
instead of guessing 1:1).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import uom_service
from app.services.uom_service import UomConversionError

router = APIRouter()


class RollupLine(BaseModel):
    quantity: float
    uom: Optional[str] = None


class RollupRequest(BaseModel):
    lines: list[RollupLine]


@router.get("/units")
async def list_units(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    units = await uom_service.list_units(db)
    return [
        {
            "id": u.id,
            "code": u.code,
            "name": u.name,
            "dimension": u.dimension,
            "is_base": u.is_base,
        }
        for u in units
    ]


@router.get("/convert")
async def convert_quantity(
    quantity: float,
    from_uom: str,
    to_uom: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        value = await uom_service.convert(db, quantity, from_uom, to_uom)
    except UomConversionError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {
        "quantity": quantity,
        "from_uom": from_uom,
        "to_uom": to_uom,
        "result": float(value),
    }


@router.post("/rollup-quantities")
async def rollup_quantities(
    body: RollupRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Demonstrates/exercises the mixed-unit BOM roll-up: totals a list of
    (quantity, uom) BOM lines per physical dimension. See uom_service.
    rollup_quantities for the exact hook bom_service.get_quantity_rollup
    should call to get this for real BOM line items.
    """
    result = await uom_service.rollup_quantities(db, [line.model_dump() for line in body.lines])
    return {
        "by_dimension": [
            {**d, "total": float(d["total"])} for d in result["by_dimension"]
        ],
        "unconverted": [
            {**u, "total": float(u["total"])} for u in result["unconverted"]
        ],
    }

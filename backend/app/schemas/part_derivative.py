"""API schemas for typed CAD derivative links (part_derivatives table).

The ORM model (app/models/part_derivative.py) uses snake_case attribute names
(part_id, drawing_status, created_at) — an intentional exception to this
codebase's usual camelCase columns, inherited as-is from the already-verified
migration 047_solidworks_integration.py. These schemas translate that shape to
the camelCase the rest of the API surfaces (partId, drawingStatus, createdAt).
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

ALLOWED_DERIVATIVE_KINDS = ("pdf", "step", "dwg", "dxf", "other")


class PartDerivativeCreate(BaseModel):
    partId: int
    kind: str = Field(..., json_schema_extra={"example": "step"})
    url: str = Field(..., max_length=2048, json_schema_extra={"example": "cad/exports/W-1.step"})
    drawingStatus: Optional[str] = Field(
        default=None, json_schema_extra={"example": "released"}
    )


class PartDerivativeResponse(BaseModel):
    id: int
    partId: int
    kind: str
    url: str
    drawingStatus: Optional[str] = None
    createdAt: Optional[datetime] = None

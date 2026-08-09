"""Read schema for the canonical BOM header (table `boms`).

Minimal — bom_enterprise.py's list/create endpoints build their own response
dicts by hand (existing pattern in that file), so this schema's job is just
to give GET /bom/{bom_id} a typed response and to surface `bom_type`
(migration 052 / xBOM) somewhere formal, not to replace the dict-based
endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class BOMRead(BaseModel):
    id: int
    bom_number: str
    name: str
    description: Optional[str] = None
    status: str
    bom_type: str
    version: Optional[str] = None
    revision: Optional[int] = None
    project_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

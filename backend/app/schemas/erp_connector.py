from typing import Optional

from pydantic import BaseModel, ConfigDict


class ERPConnectorBase(BaseModel):
    name: str
    type: str
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None
    active: bool = True
    config: Optional[dict] = None


class ERPConnectorCreate(ERPConnectorBase):
    pass


class ERPConnectorUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None
    active: Optional[bool] = None
    config: Optional[dict] = None


class ERPConnectorResponse(ERPConnectorBase):
    id: int
    lastSyncAt: Optional[str] = None
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ERPSyncLogResponse(BaseModel):
    id: int
    connectorId: int
    direction: str
    entityType: str
    recordsCount: int = 0
    status: str
    errors: Optional[str] = None
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ERPSyncRequest(BaseModel):
    entityType: str = "parts"
    direction: str = "outbound"


class ERPTestConnectionRequest(BaseModel):
    baseUrl: str
    apiKey: Optional[str] = None


class ERPConnectorListResponse(BaseModel):
    total: int
    items: list[ERPConnectorResponse]

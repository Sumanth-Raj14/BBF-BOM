from typing import Optional

from pydantic import BaseModel, ConfigDict

# --- Demand Forecast ---


class DemandForecastBase(BaseModel):
    partId: int
    forecast: Optional[dict] = None
    confidence: float = 0.0


class DemandForecastCreate(BaseModel):
    partIds: list[int] = []
    forecastMonths: int = 6


class DemandForecastResponse(BaseModel):
    id: int
    partId: int
    forecast: Optional[dict] = None
    confidence: float = 0.0
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DemandForecastListResponse(BaseModel):
    total: int
    items: list[DemandForecastResponse]


# --- Interchangeability ---


class InterchangeabilitySuggestionBase(BaseModel):
    partId: int
    suggestedPartId: int
    score: float = 0.0
    reason: Optional[str] = None
    status: str = "pending"


class InterchangeabilityAnalyzeRequest(BaseModel):
    category: Optional[str] = None
    minSimilarity: float = 0.7


class InterchangeabilitySuggestionResponse(BaseModel):
    id: int
    partId: int
    suggestedPartId: int
    score: float = 0.0
    reason: Optional[str] = None
    status: str = "pending"
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InterchangeabilityListResponse(BaseModel):
    total: int
    items: list[InterchangeabilitySuggestionResponse]


# --- Validation ---


class ValidationResultBase(BaseModel):
    entityType: Optional[str] = None
    entityId: Optional[int] = None
    result: Optional[dict] = None
    passed: bool = False


class ValidationRunRequest(BaseModel):
    partIds: list[int] = []
    rules: Optional[list[str]] = None


class ValidationResultResponse(BaseModel):
    id: int
    entityType: Optional[str] = None
    entityId: Optional[int] = None
    result: Optional[dict] = None
    passed: bool = False
    createdAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ValidationListResponse(BaseModel):
    total: int
    items: list[ValidationResultResponse]


# --- Approval Automation Rules ---


class ApprovalAutomationRuleBase(BaseModel):
    name: str
    description: Optional[str] = None
    entityType: str
    conditionField: str
    conditionOperator: str
    conditionValue: str
    action: str = "auto_approve"
    isActive: bool = True
    priority: int = 0


class ApprovalAutomationRuleCreate(ApprovalAutomationRuleBase):
    pass


class ApprovalAutomationRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    entityType: Optional[str] = None
    conditionField: Optional[str] = None
    conditionOperator: Optional[str] = None
    conditionValue: Optional[str] = None
    action: Optional[str] = None
    isActive: Optional[bool] = None
    priority: Optional[int] = None


class ApprovalAutomationRuleResponse(ApprovalAutomationRuleBase):
    id: int
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ApprovalAutomationRuleListResponse(BaseModel):
    total: int
    items: list[ApprovalAutomationRuleResponse]


class ApprovalEvaluateRequest(BaseModel):
    approvalId: int


class ApprovalEvaluateResponse(BaseModel):
    approvalId: int
    matched: bool
    matchedRules: list[ApprovalAutomationRuleResponse]
    action: Optional[str] = None
    message: str

from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.db.session import get_db
from app.models.ai_models import (
    DemandForecast,
    InterchangeabilitySuggestion,
    ValidationResult,
)
from app.models.part import Part
from app.models.po_models import POLineItem
from app.models.user import User
from app.schemas.ai_schemas import (
    DemandForecastCreate,
    DemandForecastListResponse,
    DemandForecastResponse,
    InterchangeabilityAnalyzeRequest,
    InterchangeabilityListResponse,
    InterchangeabilitySuggestionResponse,
    ValidationListResponse,
    ValidationResultResponse,
    ValidationRunRequest,
)

router = APIRouter()


# --- Built-in Poka-Yoke Validation Rules ---

VALIDATION_RULES = {
    "missing_pn": {
        "name": "missing_pn",
        "severity": "error",
        "message": "Part number (pn) is missing or empty",
        "check": lambda part: bool(getattr(part, "pn", None)),
    },
    "missing_name": {
        "name": "missing_name",
        "severity": "error",
        "message": "Part name is missing or empty",
        "check": lambda part: bool(getattr(part, "name", None)),
    },
    "missing_category": {
        "name": "missing_category",
        "severity": "warning",
        "message": "Part category is not set",
        "check": lambda part: bool(getattr(part, "category", None)),
    },
    "missing_vendor": {
        "name": "missing_vendor",
        "severity": "warning",
        "message": "Vendor is not specified",
        "check": lambda part: bool(getattr(part, "vendor", None)),
    },
    "missing_manufacturer": {
        "name": "missing_manufacturer",
        "severity": "warning",
        "message": "Manufacturer is not specified",
        "check": lambda part: bool(getattr(part, "manufacturer", None)),
    },
    "zero_cost": {
        "name": "zero_cost",
        "severity": "info",
        "message": "Part cost is zero or not set",
        "check": lambda part: getattr(part, "cost", 0) > 0,
    },
    "missing_mpn": {
        "name": "missing_mpn",
        "severity": "warning",
        "message": "Manufacturer Part Number (MPN) is missing",
        "check": lambda part: bool(getattr(part, "mpn", None)),
    },
    "missing_rev": {
        "name": "missing_rev",
        "severity": "info",
        "message": "Revision is not set",
        "check": lambda part: bool(getattr(part, "rev", None)),
    },
    "deprecated_status": {
        "name": "deprecated_status",
        "severity": "error",
        "message": "Part status is Deprecated or Obsolete",
        "check": lambda part: getattr(part, "status", "") not in ("Deprecated", "Obsolete"),
    },
}


# --- Demand Forecast ---


@router.post("/demand-forecast/generate", response_model=DemandForecastListResponse)
async def generate_demand_forecast(
    req: DemandForecastCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    forecasts = []
    now = datetime.now(UTC)

    if req.partIds:
        result = await db.execute(select(Part).where(Part.id.in_(req.partIds)))
        parts = result.scalars().all()
    else:
        result = await db.execute(select(Part).limit(100))
        parts = result.scalars().all()

    for part in parts:
        qty_result = await db.execute(
            select(func.coalesce(func.sum(POLineItem.quantity), 0)).where(
                POLineItem.itemName.ilike(f"%{part.name}%")
            )
        )
        historical_qty = qty_result.scalar() or 0

        for m in range(req.forecastMonths):
            forecast_date = (now + timedelta(days=30 * m)).strftime("%Y-%m-%d")
            season_factor = 1.0 + (0.1 * ((m % 4) - 1.5))
            predicted = max(1, int(historical_qty * season_factor / max(1, req.forecastMonths)))
            confidence = min(0.95, 0.5 + (0.05 * (req.forecastMonths - m)))

            forecast_data = {
                "forecastDate": forecast_date,
                "predictedQuantity": predicted,
                "model": "statistical_ma",
            }
            forecast = DemandForecast(
                partId=part.id,
                forecast=forecast_data,
                confidence=round(confidence, 2),
                tenantId=current_user.tenantId,
            )
            db.add(forecast)
            forecasts.append(forecast)

    await db.commit()

    return DemandForecastListResponse(
        total=len(forecasts),
        items=[
            DemandForecastResponse(
                id=f.id,
                partId=f.partId,
                forecast=f.forecast,
                confidence=f.confidence,
                createdAt=str(f.createdAt) if f.createdAt else None,
            )
            for f in forecasts
        ],
    )


@router.get("/demand-forecast")
async def list_demand_forecasts(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(DemandForecast)
    if partId:
        query = query.where(DemandForecast.partId == partId)
    query = query.order_by(DemandForecast.id)
    result = await paginate(db, query, page)

    result["items"] = [
        DemandForecastResponse(
            id=f.id,
            partId=f.partId,
            forecast=f.forecast,
            confidence=f.confidence,
            createdAt=str(f.createdAt) if f.createdAt else None,
        )
        for f in result["items"]
    ]

    return result


# --- Interchangeability ---


@router.post("/interchangeability/analyze", response_model=InterchangeabilityListResponse)
async def analyze_interchangeability(
    req: InterchangeabilityAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Part)
    if req.category:
        query = query.where(Part.category == req.category)
    result = await db.execute(query)
    parts = result.scalars().all()

    suggestions = []
    for i, p1 in enumerate(parts):
        for p2 in parts[i + 1 :]:
            similarity = 0.0
            reasons = []

            if p1.category and p2.category and p1.category == p2.category:
                similarity += 0.3
                reasons.append("same_category")
            if p1.manufacturer and p2.manufacturer and p1.manufacturer == p2.manufacturer:
                similarity += 0.2
                reasons.append("same_manufacturer")
            if p1.subCategory and p2.subCategory and p1.subCategory == p2.subCategory:
                similarity += 0.2
                reasons.append("same_subcategory")
            if p1.mpn and p2.mpn and p1.mpn == p2.mpn:
                similarity += 0.3
                reasons.append("same_mpn")
            if p1.material and p2.material and p1.material == p2.material:
                similarity += 0.1
                reasons.append("same_material")
            if p1.weight and p2.weight and abs(p1.weight - p2.weight) < 0.1:
                similarity += 0.1
                reasons.append("similar_weight")

            similarity = min(1.0, similarity)
            if similarity >= req.minSimilarity:
                suggestion = InterchangeabilitySuggestion(
                    partId=p1.id,
                    suggestedPartId=p2.id,
                    score=round(similarity, 3),
                    reason=", ".join(reasons),
                    status="pending",
                    tenantId=current_user.tenantId,
                )
                db.add(suggestion)
                suggestions.append(suggestion)

    await db.commit()

    return InterchangeabilityListResponse(
        total=len(suggestions),
        items=[
            InterchangeabilitySuggestionResponse(
                id=s.id,
                partId=s.partId,
                suggestedPartId=s.suggestedPartId,
                score=s.score,
                reason=s.reason,
                status=s.status,
                createdAt=str(s.createdAt) if s.createdAt else None,
            )
            for s in suggestions
        ],
    )


@router.get("/interchangeability")
async def list_interchangeability(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(InterchangeabilitySuggestion)
    if partId:
        query = query.where(
            (InterchangeabilitySuggestion.partId == partId)
            | (InterchangeabilitySuggestion.suggestedPartId == partId)
        )
    if status_filter:
        query = query.where(InterchangeabilitySuggestion.status == status_filter)
    query = query.order_by(
        InterchangeabilitySuggestion.score.desc(), InterchangeabilitySuggestion.id
    )
    result = await paginate(db, query, page)

    result["items"] = [
        InterchangeabilitySuggestionResponse(
            id=s.id,
            partId=s.partId,
            suggestedPartId=s.suggestedPartId,
            score=s.score,
            reason=s.reason,
            status=s.status,
            createdAt=str(s.createdAt) if s.createdAt else None,
        )
        for s in result["items"]
    ]

    return result


# --- Validation ---


@router.post("/validation/run", response_model=ValidationListResponse)
async def run_validation(
    req: ValidationRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.partIds:
        result = await db.execute(select(Part).where(Part.id.in_(req.partIds)))
    else:
        result = await db.execute(select(Part).limit(100))
    parts = result.scalars().all()

    rule_names = req.rules or list(VALIDATION_RULES.keys())
    results = []

    for part in parts:
        for rule_name in rule_names:
            rule = VALIDATION_RULES.get(rule_name)
            if not rule:
                continue
            passed = rule["check"](part)
            validation = ValidationResult(
                entityType="part",
                entityId=part.id,
                result={
                    "ruleName": rule_name,
                    "message": rule["message"] if not passed else f"Passed: {rule_name}",
                    "severity": rule["severity"],
                },
                passed=passed,
                tenantId=current_user.tenantId,
            )
            db.add(validation)
            results.append(validation)

    await db.commit()

    return ValidationListResponse(
        total=len(results),
        items=[
            ValidationResultResponse(
                id=r.id,
                entityType=r.entityType,
                entityId=r.entityId,
                result=r.result,
                passed=r.passed,
                createdAt=str(r.createdAt) if r.createdAt else None,
            )
            for r in results
        ],
    )


@router.get("/validation/results")
async def list_validation_results(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    passed: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ValidationResult)
    if partId:
        query = query.where(ValidationResult.entityId == partId)
    if passed is not None:
        query = query.where(ValidationResult.passed == passed)
    query = query.order_by(ValidationResult.id)
    result = await paginate(db, query, page)

    result["items"] = [
        ValidationResultResponse(
            id=r.id,
            entityType=r.entityType,
            entityId=r.entityId,
            result=r.result,
            passed=r.passed,
            createdAt=str(r.createdAt) if r.createdAt else None,
        )
        for r in result["items"]
    ]

    return result

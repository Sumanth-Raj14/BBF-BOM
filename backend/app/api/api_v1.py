from fastapi import APIRouter, Depends

from app.api import endpoints

api_router = APIRouter()

# Tenant Management (superuser only)
api_router.include_router(endpoints.tenants.router, prefix="/tenants", tags=["tenants"])

# Include all endpoint routers
api_router.include_router(endpoints.parts.router, prefix="/parts", tags=["parts"])
api_router.include_router(endpoints.projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(endpoints.vendors.router, prefix="/vendors", tags=["vendors"])
api_router.include_router(endpoints.procurement.router, prefix="/procurement", tags=["procurement"])
api_router.include_router(endpoints.documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(endpoints.users.router, prefix="/users", tags=["users"])
api_router.include_router(endpoints.auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(endpoints.user_sync.router, prefix="/user-sync", tags=["user-sync"])
api_router.include_router(endpoints.calendar_events.router, prefix="/calendar", tags=["calendar"])
api_router.include_router(endpoints.audit_logs.router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(
    endpoints.notifications.router, prefix="/notifications", tags=["notifications"]
)
api_router.include_router(endpoints.comments.router, prefix="/comments", tags=["comments"])
api_router.include_router(endpoints.approvals.router, prefix="/approvals", tags=["approvals"])
api_router.include_router(
    endpoints.price_history.router, prefix="/price-history", tags=["price-history"]
)
api_router.include_router(endpoints.revisions.router, prefix="/revisions", tags=["revisions"])
api_router.include_router(
    endpoints.bom_templates.router, prefix="/bom-templates", tags=["bom-templates"]
)
api_router.include_router(
    endpoints.part_vendors.router, prefix="/part-vendors", tags=["part-vendors"]
)
api_router.include_router(
    endpoints.country_history.router,
    prefix="/country-history",
    tags=["country-history"],
)
api_router.include_router(
    endpoints.barcodes.router,
    prefix="/barcodes",
    tags=["barcodes"],
)
api_router.include_router(
    endpoints.bom_items.router,
    prefix="/bom-items",
    tags=["bom-items"],
)
api_router.include_router(
    endpoints.ocr.router,
    prefix="/ocr",
    tags=["ocr"],
)
api_router.include_router(
    endpoints.analytics.router,
    prefix="/analytics",
    tags=["analytics"],
)
api_router.include_router(
    endpoints.cad.router,
    prefix="/cad",
    tags=["cad"],
)
api_router.include_router(
    endpoints.scraping.router,
    prefix="/scraping",
    tags=["scraping"],
)
api_router.include_router(
    endpoints.po_order.router,
    prefix="/po-orders",
    tags=["po-orders"],
)
api_router.include_router(
    endpoints.sso.router,
    prefix="/sso",
    tags=["sso"],
)
api_router.include_router(
    endpoints.roles_permissions.router,
    prefix="/rbac",
    tags=["rbac"],
)
api_router.include_router(
    endpoints.sessions.router,
    prefix="/sessions",
    tags=["sessions"],
)
api_router.include_router(
    endpoints.export_report.router,
    prefix="/export",
    tags=["export"],
)

# Phase 2 — Backup & Recovery
api_router.include_router(
    endpoints.backup.router,
    prefix="/backup",
    tags=["backup"],
)

# Phase 3 — Supply Chain Depth
api_router.include_router(
    endpoints.make_vs_buy.router,
    prefix="/make-vs-buy",
    tags=["make-vs-buy"],
)
api_router.include_router(
    endpoints.should_cost.router,
    prefix="/should-cost",
    tags=["should-cost"],
)
api_router.include_router(
    endpoints.supplier_scorecard.router,
    prefix="/supplier-scorecards",
    tags=["supplier-scorecards"],
)
api_router.include_router(
    endpoints.capa.router,
    prefix="/capas",
    tags=["capas"],
)
api_router.include_router(
    endpoints.fai.router,
    prefix="/fai",
    tags=["fai"],
)
api_router.include_router(
    endpoints.deviation.router,
    prefix="/deviations",
    tags=["deviations"],
)
api_router.include_router(
    endpoints.traceability.router,
    prefix="/traceability",
    tags=["traceability"],
)
api_router.include_router(
    endpoints.kanban.router,
    prefix="/kanban",
    tags=["kanban"],
)
api_router.include_router(
    endpoints.contract.router,
    prefix="/contracts",
    tags=["contracts"],
)


# Phase 4 — Integration
api_router.include_router(
    endpoints.webhooks.router,
    prefix="/webhooks",
    tags=["webhooks"],
)
api_router.include_router(
    endpoints.bulk_import.router,
    prefix="/import",
    tags=["bulk-import"],
)
api_router.include_router(
    endpoints.erp_connectors.router,
    prefix="/erp-connectors",
    tags=["erp-connectors"],
)
api_router.include_router(
    endpoints.supplier_portal.router,
    prefix="/supplier-portal",
    tags=["supplier-portal"],
)


# Phase 5 & 6 — AI Features & Approval Automation
api_router.include_router(
    endpoints.ai_features.router,
    prefix="/ai",
    tags=["ai-features"],
)
api_router.include_router(
    endpoints.approval_automation.router,
    prefix="/approval-automation",
    tags=["approval-automation"],
)

# Order Tracking
api_router.include_router(
    endpoints.order_tracking.router,
    prefix="/order-tracking",
    tags=["order-tracking"],
)

# SolidWorks Integration
api_router.include_router(
    endpoints.solidworks_integration.router,
    prefix="/solidworks",
    tags=["solidworks-integration"],
)

# Teams + unified work queue (WS2)
api_router.include_router(endpoints.teams.router, prefix="/teams", tags=["teams"])
api_router.include_router(endpoints.work_queue.router, prefix="/work", tags=["work-queue"])
api_router.include_router(endpoints.integrations.router, prefix="/integrations", tags=["integrations"])

# Enterprise Features
api_router.include_router(
    endpoints.bom_enterprise.router,
    prefix="/bom",
    tags=["bom-enterprise"],
)
api_router.include_router(
    endpoints.eco_api.router,
    prefix="/eco",
    tags=["eco"],
)
api_router.include_router(
    endpoints.work_order_api.router,
    prefix="/work-orders",
    tags=["work-orders"],
)
api_router.include_router(
    endpoints.inventory_api.router,
    prefix="/inventory",
    tags=["inventory"],
)
api_router.include_router(
    endpoints.quality_api.router,
    prefix="/quality",
    tags=["quality"],
)

# Advanced Search
api_router.include_router(
    endpoints.search.router,
    prefix="/search",
    tags=["search"],
)

# Enterprise Extensions - Service BOM, BOM Merge
api_router.include_router(
    endpoints.service_bom.router,
    prefix="/enterprise",
    tags=["service-bom", "bom-merge"],
)

# Routing & Process Plans
api_router.include_router(
    endpoints.routing_api.router,
    prefix="/manufacturing",
    tags=["routing", "process-plans"],
)

# Resource Scheduling & Labor
api_router.include_router(
    endpoints.resource_api.router,
    prefix="/manufacturing",
    tags=["resource-scheduling", "labor"],
)

# Multi-Currency, Compliance, Auto-Numbering, Custom Attributes
api_router.include_router(
    endpoints.enterprise_ext_api.router,
    prefix="/enterprise",
    tags=["multi-currency", "compliance-certs", "auto-numbering", "custom-attributes"],
)

# Dashboards (Engineering, Manufacturing, Procurement, Executive)
api_router.include_router(
    endpoints.dashboards_api.router,
    prefix="/dashboards",
    tags=["dashboards"],
)

# Compliance Management (ISO 9001, AS9100, RoHS, REACH)
api_router.include_router(
    endpoints.compliance_api.router,
    prefix="/compliance",
    tags=["compliance"],
)

# API Key Management
api_router.include_router(
    endpoints.api_keys.router,
    prefix="/api-keys",
    tags=["api-keys"],
)

# SAML SSO
from app.core.saml_sso import router as saml_router

api_router.include_router(saml_router)


# Monitoring endpoints
from fastapi import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.monitoring.health import get_detailed_health
from app.monitoring.metrics import metrics


@api_router.get("/metrics")
async def prometheus_metrics(user: User = Depends(get_current_user)):
    body = metrics.export_prometheus()
    return Response(content=body, media_type="text/plain; version=0.0.4; charset=utf-8")


@api_router.get("/health/detailed")
async def detailed_health(db: AsyncSession = Depends(get_db)):
    return await get_detailed_health(db)


# Health check endpoint
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "blackbox-bom-api"}

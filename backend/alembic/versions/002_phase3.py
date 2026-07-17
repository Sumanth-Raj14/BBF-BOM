"""Phase 3 — Supply Chain Depth tables.

Revision ID: 002_phase3
Revises: 001_initial
Create Date: 2026-06-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

from alembic import op

revision = "002_phase3"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 3.1 Make vs. Buy
    op.create_table(
        "make_vs_buy_analyses",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("projectId", sa.Integer, sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("decision", sa.String, nullable=False),
        sa.Column("makeMaterialCost", sa.Float, default=0.0),
        sa.Column("makeLaborCost", sa.Float, default=0.0),
        sa.Column("makeOverheadCost", sa.Float, default=0.0),
        sa.Column("makeToolingCost", sa.Float, default=0.0),
        sa.Column("makeTotalCost", sa.Float, default=0.0),
        sa.Column("buyUnitPrice", sa.Float, default=0.0),
        sa.Column("buyNreCost", sa.Float, default=0.0),
        sa.Column("buyTotalCost", sa.Float, default=0.0),
        sa.Column("qualityScore", sa.Integer, default=5),
        sa.Column("leadTimeDays", sa.Integer, default=0),
        sa.Column("capacityScore", sa.Integer, default=5),
        sa.Column("ipRiskScore", sa.Integer, default=5),
        sa.Column("supplyRiskScore", sa.Integer, default=5),
        sa.Column("recommendation", sa.String),
        sa.Column("rationale", sa.Text),
        sa.Column("status", sa.String, default="Draft"),
        sa.Column("attachments", JSON, default=[]),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("approvedBy", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # 3.2 Should-Cost
    op.create_table(
        "should_cost_models",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("rawMaterialCost", sa.Float, default=0.0),
        sa.Column("materialWastePct", sa.Float, default=5.0),
        sa.Column("materialTotal", sa.Float, default=0.0),
        sa.Column("laborHours", sa.Float, default=0.0),
        sa.Column("laborRatePerHour", sa.Float, default=0.0),
        sa.Column("laborTotal", sa.Float, default=0.0),
        sa.Column("overheadPct", sa.Float, default=30.0),
        sa.Column("overheadTotal", sa.Float, default=0.0),
        sa.Column("toolingCost", sa.Float, default=0.0),
        sa.Column("toolingAmortizedQty", sa.Integer, default=1000),
        sa.Column("toolingPerUnit", sa.Float, default=0.0),
        sa.Column("profitMarginPct", sa.Float, default=15.0),
        sa.Column("profitAmount", sa.Float, default=0.0),
        sa.Column("shouldCostPerUnit", sa.Float, default=0.0),
        sa.Column("actualVendorPrice", sa.Float, default=0.0),
        sa.Column("variancePct", sa.Float, default=0.0),
        sa.Column("notes", sa.Text),
        sa.Column("Assumptions", sa.Text),
        sa.Column("status", sa.String, default="Draft"),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # 3.3 Supplier Scorecard
    op.create_table(
        "supplier_scorecards",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("vendorId", sa.Integer, sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("period", sa.String, nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("quarter", sa.Integer),
        sa.Column("qualityScore", sa.Float, default=0.0),
        sa.Column("deliveryScore", sa.Float, default=0.0),
        sa.Column("costScore", sa.Float, default=0.0),
        sa.Column("responsivenessScore", sa.Float, default=0.0),
        sa.Column("complianceScore", sa.Float, default=0.0),
        sa.Column("qualityWeight", sa.Float, default=0.30),
        sa.Column("deliveryWeight", sa.Float, default=0.25),
        sa.Column("costWeight", sa.Float, default=0.20),
        sa.Column("responsivenessWeight", sa.Float, default=0.15),
        sa.Column("complianceWeight", sa.Float, default=0.10),
        sa.Column("weightedScore", sa.Float, default=0.0),
        sa.Column("grade", sa.String),
        sa.Column("totalOrders", sa.Integer, default=0),
        sa.Column("onTimeDeliveries", sa.Integer, default=0),
        sa.Column("defectCount", sa.Integer, default=0),
        sa.Column("totalUnitsReceived", sa.Integer, default=0),
        sa.Column("avgLeadTimeDays", sa.Float, default=0.0),
        sa.Column("avgResponseTimeHours", sa.Float, default=0.0),
        sa.Column("trend", sa.String),
        sa.Column("notes", sa.Text),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # 3.4 CAPA
    op.create_table(
        "capas",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("capaNumber", sa.String, unique=True, nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("source", sa.String),
        sa.Column("problemDescription", sa.Text, nullable=False),
        sa.Column("immediateAction", sa.Text),
        sa.Column("rootCauseMethod", sa.String),
        sa.Column("rootCause", sa.Text),
        sa.Column("correctiveAction", sa.Text),
        sa.Column("preventiveAction", sa.Text),
        sa.Column("actionOwner", sa.String),
        sa.Column("targetDate", sa.DateTime(timezone=True)),
        sa.Column("verificationMethod", sa.String),
        sa.Column("verificationResult", sa.String),
        sa.Column("verifiedBy", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("verifiedDate", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String, default="Open"),
        sa.Column("effectivenessCheckDate", sa.DateTime(timezone=True)),
        sa.Column("effectivenessResult", sa.String),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=True),
        sa.Column("projectId", sa.Integer, sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("vendorId", sa.Integer, sa.ForeignKey("vendors.id"), nullable=True),
        sa.Column("attachments", JSON, default=[]),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # 3.5 FAI
    op.create_table(
        "fai_reports",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("faiNumber", sa.String, unique=True, nullable=False),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("projectId", sa.Integer, sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("partName", sa.String),
        sa.Column("partNumber", sa.String),
        sa.Column("partRevision", sa.String),
        sa.Column("serialNumber", sa.String),
        sa.Column("lotBatchNumber", sa.String),
        sa.Column("rawMaterial", sa.Text),
        sa.Column("specialProcessSource", sa.Text),
        sa.Column("characteristics", JSON, default=[]),
        sa.Column("totalCharacteristics", sa.Integer, default=0),
        sa.Column("passedCharacteristics", sa.Integer, default=0),
        sa.Column("failedCharacteristics", sa.Integer, default=0),
        sa.Column("result", sa.String),
        sa.Column("inspectorName", sa.String),
        sa.Column("inspectorApprovalDate", sa.DateTime(timezone=True)),
        sa.Column("qualityApprovalDate", sa.DateTime(timezone=True)),
        sa.Column("customerApprovalDate", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String, default="Draft"),
        sa.Column("notes", sa.Text),
        sa.Column("deviations", sa.Text),
        sa.Column("attachments", JSON, default=[]),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # 3.6 Deviation / Waiver
    op.create_table(
        "deviations",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("deviationNumber", sa.String, unique=True, nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=True),
        sa.Column("projectId", sa.Integer, sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("specification", sa.Text),
        sa.Column("deviationDescription", sa.Text, nullable=False),
        sa.Column("impactAssessment", sa.Text),
        sa.Column("riskLevel", sa.String),
        sa.Column("affectedQuantity", sa.Integer, default=0),
        sa.Column("affectedLotNumbers", JSON, default=[]),
        sa.Column("requestType", sa.String),
        sa.Column("expirationDate", sa.DateTime(timezone=True)),
        sa.Column("engineeringApproval", sa.String),
        sa.Column("qualityApproval", sa.String),
        sa.Column("customerApproval", sa.String),
        sa.Column("allApprovalsReceived", sa.String, default="No"),
        sa.Column("disposition", sa.String),
        sa.Column("status", sa.String, default="Draft"),
        sa.Column("capaId", sa.Integer, sa.ForeignKey("capas.id"), nullable=True),
        sa.Column("attachments", JSON, default=[]),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # 3.7 Serial / Lot / Batch
    op.create_table(
        "serial_numbers",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("serialNumber", sa.String, unique=True, nullable=False),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("lotBatchNumber", sa.String, index=True),
        sa.Column(
            "poId", sa.Integer, sa.ForeignKey("purchase_orders.id"), nullable=True
        ),
        sa.Column("status", sa.String, default="In Stock"),
        sa.Column("currentLocation", sa.String),
        sa.Column("installedOnAsset", sa.String),
        sa.Column("installationDate", sa.DateTime(timezone=True)),
        sa.Column("statusHistory", JSON, default=[]),
        sa.Column("incomingInspectionResult", sa.String),
        sa.Column("certificationUrl", sa.String),
        sa.Column("manufactureDate", sa.DateTime(timezone=True)),
        sa.Column("expirationDate", sa.DateTime(timezone=True)),
        sa.Column("receivedDate", sa.DateTime(timezone=True)),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "lot_batches",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("lotBatchNumber", sa.String, unique=True, nullable=False),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("vendorId", sa.Integer, sa.ForeignKey("vendors.id"), nullable=True),
        sa.Column(
            "poId", sa.Integer, sa.ForeignKey("purchase_orders.id"), nullable=True
        ),
        sa.Column("quantityReceived", sa.Integer, default=0),
        sa.Column("quantityInspected", sa.Integer, default=0),
        sa.Column("quantityAccepted", sa.Integer, default=0),
        sa.Column("quantityRejected", sa.Integer, default=0),
        sa.Column("manufactureDate", sa.DateTime(timezone=True)),
        sa.Column("receivedDate", sa.DateTime(timezone=True)),
        sa.Column("expirationDate", sa.DateTime(timezone=True)),
        sa.Column("incomingInspectionResult", sa.String),
        sa.Column("certificationUrl", sa.String),
        sa.Column("status", sa.String, default="Received"),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # 3.8 Kanban Triggers
    op.create_table(
        "kanban_triggers",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("minStock", sa.Integer, nullable=False),
        sa.Column("maxStock", sa.Integer, nullable=False),
        sa.Column("reorderQuantity", sa.Integer, nullable=False),
        sa.Column("safetyStock", sa.Integer, default=0),
        sa.Column("currentStock", sa.Integer, default=0),
        sa.Column("openOrderQty", sa.Integer, default=0),
        sa.Column("autoReorder", sa.Boolean, default=False),
        sa.Column(
            "preferredVendorId", sa.Integer, sa.ForeignKey("vendors.id"), nullable=True
        ),
        sa.Column("preferredPoTemplate", sa.String),
        sa.Column("status", sa.String, default="Normal"),
        sa.Column("active", sa.Boolean, default=True),
        sa.Column("lastTriggeredAt", sa.DateTime(timezone=True)),
        sa.Column("lastPoCreated", sa.String),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # 3.9 Contract / Pricing Agreements
    op.create_table(
        "contracts",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("contractNumber", sa.String, unique=True, nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("vendorId", sa.Integer, sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("contractType", sa.String),
        sa.Column("effectiveDate", sa.DateTime(timezone=True)),
        sa.Column("expirationDate", sa.DateTime(timezone=True)),
        sa.Column("autoRenew", sa.Boolean, default=False),
        sa.Column("paymentTerms", sa.String),
        sa.Column("minimumOrderQty", sa.Integer),
        sa.Column("maximumOrderValue", sa.Float),
        sa.Column("currency", sa.String, default="USD"),
        sa.Column("pricingTiers", JSON, default=[]),
        sa.Column("partIds", JSON, default=[]),
        sa.Column("leadTimeDays", sa.Integer),
        sa.Column("qualityRequirements", sa.Text),
        sa.Column("status", sa.String, default="Draft"),
        sa.Column("attachments", JSON, default=[]),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "pricing_agreements",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "contractId", sa.Integer, sa.ForeignKey("contracts.id"), nullable=False
        ),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("vendorId", sa.Integer, sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("agreedPrice", sa.Float, nullable=False),
        sa.Column("currency", sa.String, default="USD"),
        sa.Column("effectiveDate", sa.DateTime(timezone=True)),
        sa.Column("expirationDate", sa.DateTime(timezone=True)),
        sa.Column("volumeTiers", JSON, default=[]),
        sa.Column("status", sa.String, default="Active"),
        sa.Column("createdBy", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("pricing_agreements")
    op.drop_table("contracts")
    op.drop_table("kanban_triggers")
    op.drop_table("lot_batches")
    op.drop_table("serial_numbers")
    op.drop_table("deviations")
    op.drop_table("fai_reports")
    op.drop_table("capas")
    op.drop_table("supplier_scorecards")
    op.drop_table("should_cost_models")
    op.drop_table("make_vs_buy_analyses")

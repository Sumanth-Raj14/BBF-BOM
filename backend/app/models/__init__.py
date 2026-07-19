from app.models.ai_models import (
    ApprovalAutomationRule,
    DemandForecast,
    InterchangeabilitySuggestion,
    ValidationResult,
)
from app.models.api_key import ApiKey
from app.models.approval import Approval
from app.models.audit_log import AuditLog
from app.models.audit_log_change import AuditLogChange
from app.models.backup_history import BackupHistory
from app.models.calendar_event import CalendarEvent

# Enterprise models
from app.models.bom import BOM
from app.models.bom import BOMItem as BOMItemMaster
from app.models.bom_closure import BomClosure
from app.models.bom_item import BomItem
from app.models.bom_snapshot import BomBaseline, BomSnapshot
from app.models.bom_template import BomTemplate
from app.models.bom_variant import BomVariant, BomVariantItem
from app.models.bulk_import import BulkImportJob, BulkImportRow
from app.models.capa import CAPA, CapaAttachment
from app.models.comment import Comment
from app.models.compliance import Compliance
from app.models.contract import (
    Contract,
    ContractAttachment,
    ContractParts,
    ContractPricingTier,
    PricingAgreement,
    PricingAgreementVolumeTier,
)
from app.models.deviation import Deviation, DeviationAttachment, DeviationLot
from app.models.digital_signature import DigitalSignature, UserMfa
from app.models.document import Document
from app.models.eco import EcoApproval, EcoHeader, EcoItem, EcoItemAttributeChange, EcoNotification
from app.models.eco_change import EcoChange
from app.models.enterprise_extensions import (
    AutoNumberScheme,
    ComplianceCertificate,
    Currency,
    CustomAttributeDefinition,
    CustomAttributeOption,
    CustomAttributeValidationRule,
    ExchangeRate,
)
from app.models.erp_connector import ERPConnector, ERPSyncLog
from app.models.esignature import ESignature
from app.models.fai import FaiAttachment, FaiCharacteristic, FAIReport
from app.models.inventory import (
    BinLocation,
    Inventory,
    InventoryReservation,
    InventoryTransaction,
    Warehouse,
)
from app.models.integration import (
    IntegrationConnection,
    IntegrationExternalLink,
    IntegrationOutbox,
)
from app.models.kanban import KanbanTrigger
from app.models.labor import LaborRate, TimesheetEntry
from app.models.make_vs_buy import MakeVsBuyAnalysis
from app.models.mbom import MbomHeader, MbomItem, MbomOperation
from app.models.notification import Notification
from app.models.notification_queue import NotificationQueue
from app.models.order_tracking import OrderTracking, ShipmentUpdate, TrackingMilestone
from app.models.part import Part
from app.models.part_country_history import PartCountryHistory, PartVendorPrice
from app.models.part_custom_field import PartCustomField
from app.models.part_lifecycle import LifecycleDefinition, PartLifecycle
from app.models.part_vendor import PartVendor
from app.models.permission import Permission
from app.models.po_models import POHeader, POLineItem
from app.models.price_history import PriceHistory
from app.models.project import Project
from app.models.quality import CapaAction, InspectionPlan, InspectionRecord, NcrReport
from app.models.resource_scheduling import CapacityReport, ResourceSchedule, WorkCenter
from app.models.revision import Revision, RevisionBomSnapshotItem
from app.models.role import Role
from app.models.routing import (
    ProcessPlan,
    ProcessPlanStep,
    RoutingOperation,
    RoutingTable,
)

# Enterprise extension models
from app.models.service_bom import ServiceBomHeader, ServiceBomItem
from app.models.session import UserSession
from app.models.should_cost import ShouldCostModel

# RoHS/REACH substance compliance — GLOBAL reference (substance.py), tenant-owned
# composition/declarations (part_composition.py) and evaluation caches
# (compliance_evaluation.py). The tenant-aware ones subclass TenantAwareMixin so
# register_tenant_listeners() sees them via __subclasses__().
from app.models.compliance_evaluation import ComplianceEvaluation, ReachObligation
from app.models.part_composition import (
    ExemptionClaim,
    PartMaterial,
    PartMaterialSubstance,
    SubstanceDeclaration,
)
from app.models.substance import (
    RegulationVersion,
    RestrictedSubstanceEntry,
    RohsExemption,
    Substance,
    SubstanceGroup,
)
from app.models.supplier_portal import (
    RfqHeader,
    RfqLineItem,
    RfqSupplierResponse,
    SupplierPriceUpdate,
    SupplierUser,
)
from app.models.supplier_scorecard import SupplierScorecard
from app.models.tag import Tag
from app.models.team import Team, TeamMember
from app.models.tenant import Tenant
from app.models.token_blacklist import TokenBlacklist
from app.models.traceability import LotBatch, SerialNumber, SerialNumberEvent
from app.models.user import User
from app.models.user_data import (
    BomDraft,
    SavedSearch,
    ScanHistory,
    UserChecklistProgress,
    UserDataStore,
    UserPreference,
)
from app.models.vendor import Vendor

# Zoho Books two-way sync state (spec §2) — imported here so
# register_tenant_listeners() sees them as TenantAwareMixin subclasses.
from app.models.zoho_sync import ZohoSyncCursor, ZohoSyncLog, ZohoSyncState

# Integration models
from app.models.webhook import WebhookDelivery, WebhookSubscription
from app.models.work_order import WorkOrder, WorkOrderMaterial, WorkOrderOperation

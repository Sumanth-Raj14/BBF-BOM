// Central re-export hub for all application modules.
// New code should import from here instead of using window.* globals.
// Window shims remain active for backward compatibility during migration.
// Migration status: Phase 3 complete (all files have named exports).

// ── API Layer ──
export {
  escapeHtml, openPrintWindow, setOnUnauthorized, apiRequest,
  authAPI, tenantsAPI, partsAPI, projectsAPI, vendorsAPI,
  procurementAPI, documentsAPI, usersAPI, notificationsAPI,
  commentsAPI, approvalsAPI, auditLogsAPI, priceHistoryAPI,
  revisionsAPI, bomTemplatesAPI, bomEnterpriseAPI, complianceAPI,
  schedulingAPI, partVendorsAPI, ocrAPI, countryHistoryAPI,
  barcodesAPI, analyticsAPI, cadAPI, scrapingAPI, poOrdersAPI,
  makeVsBuyAPI, shouldCostAPI, supplierScorecardAPI, capaAPI,
  faiAPI, deviationAPI, traceabilityAPI, kanbanAPI, contractAPI,
  healthAPI, webhooksAPI, bulkImportAPI, erpConnectorsAPI,
  supplierPortalAPI, monitoringAPI, aiAPI, approvalAutomationAPI,
  orderTrackingAPI, api,
} from '../api.js';

// ── Core UI Components ──
export {
  Icon,
} from './root/icons.jsx';

export {
  AppCtx, useAppStore,
  ToastHost, Modal, Popover, DropdownButton,
} from './root/overlays.jsx';

export {
  ErrorBoundary, Skeleton, SkeletonTable, SkeletonCards,
  EmptyState, LoadingState, ErrorState,
  rateLimiter, perf, a11y, normalize,
  fetchWithRetry,
  register, unregister, getShortcuts, setEnabled, keyboardShortcuts,
} from './root/enterprise-utils.jsx';

// ── Collaboration ──
export {
  CollabProvider, useCollab, CollaborationBar,
  CursorOverlay, PresenceAvatar, CollabContext,
} from './root/collaboration.jsx';

// ── Screen Components ──
export {
  BomEditor, Sparkline, LeadHeat, fmt, STATUS_CLASS,
  INR, USD_TO_INR, setConversionRate,
} from './root/bom-editor.jsx';

export {
  PartsScreen,
} from './root/parts-screen.jsx';

export {
  DashboardScreen,
} from './root/dashboard.jsx';

export {
  Drawer,
} from './root/detail-drawer.jsx';

export {
  WebhooksScreen, BulkImportScreen, ERPConnectorsScreen,
  SupplierPortalScreen, AIFeaturesScreen, MonitoringScreen,
  OrderTrackingScreen,
} from './root/integration-screens.jsx';

export {
  EnterpriseDashboardsScreen, ServiceBOMScreen, RoutingScreen,
  WorkCentersScreen, LaborScreen, CurrencyScreen,
  ComplianceAutoNumberScreen, CustomAttributesScreen, APIKeysScreen,
} from './root/enterprise-screens.jsx';

export {
  MobileScannerScreen,
} from './root/mobile-scanner.jsx';

export {
  TenantsAdminScreen,
} from './root/tenant-admin.jsx';

export {
  PODetailModal, VendorDetailModal, CADImportModal, BarcodeScanModal,
  GlobalSearchModal, ProfileModal, SettingsModal, HelpModal, ImportRFQsModal,
  QuoteHistoryModal, AutoScrapeModal, DocumentFolderTree,
  BulkImportModal, BOMTemplatesModal, BOMDuplicationModal, RollbackModal,
  ProcurementAlertsModal,
} from './components/modals/index.jsx';

export {
  VirtualList, LazyLoad, ContextMenu, Tooltip,
  setTheme, toggleTheme,
  prefetch, memo, securityAudit, validate, notify, exportData, bulkOps, searchEngine,
} from './root/enterprise-final.jsx';

export {
  UNDO, recordUndo, runUndo, applyAccessibilityTheme,
  CommandPalette, WorkOrdersScreen, NCRScreen, LandedCostModal, MarginModal,
  ShareLinkModal, WebhooksModal, ScheduledReportsModal, EmailParseModal, Presence,
} from './root/power-features.jsx';

export {
  useURLState, getSavedSearches, saveSavedSearch, SAVED_SEARCHES_KEY,
  ApprovalsScreen, RoadmapModal, BulkVendorImportModal, NotifPrefsModal, NetworkBadge,
} from './root/final-polish.jsx';

export {
  optimistic, ErrorScreen, SkeletonRows, InventoryScreen, PricingModal, ProductTour,
} from './root/prod-additions.jsx';

export { cloudSync } from '../cloud-sync.js';

// ── Data / Projects ──
export { BOM_DATA } from '../data.js';
export { PROJECTS } from '../projects.js';

// ── Auth / Onboarding ──
export {
  ROLES, TenantContext, AuthScreen, OnboardingWizard, MobileScanView, TenantSettingsModal,
} from './root/auth-onboarding.jsx';

// ── Shared Utilities / Components ──
export { BomShell } from './components/LazyScreens.jsx';
export { LoadingScreen, LoadingSkeleton } from './components/LoadingScreen.jsx';

// ── i18n ──
export { __t } from './i18n.js';

// ── Framework Globals ──
export { React, ReactDOM } from './setup.js';

// ── App Utilities ──
export { downloadCSV, downloadJSON, generateXLSX, downloadBlob, printBOM } from './utils/download.js';

export { WORKSPACE_BUDGET } from './root/dashboard.jsx';

# Frontend Migration Map — "one owner per screen"

Purpose: identify the **single live source file** for every screen/feature so fixes land in the code that actually runs. Produced during WS0.

## Live render path

```
main.jsx
  ├─ side-effect imports root/*.jsx  → register components on window.*
  └─ root/app.jsx (624 B shim)  → screens/App.jsx  (real shell)
                                     ├─ components/TopBar.jsx
                                     ├─ components/NavRail.jsx
                                     ├─ components/ModalsHost.jsx
                                     └─ routes → LazyScreens.jsx
                                          └─ dynamic import root/*.jsx → window[GlobalName]
```

The app uses a **shim architecture**: several `root/*.jsx` files are now thin compatibility shims that import the real implementation from `components/**` and register it on `window`. This is a *deliberate, functional* layer — NOT dead duplication.

## Ownership table

### Migrated — live owner is `components/**` (root file is a shim; keep it)
| Screen / feature | Live owner | Shim |
|---|---|---|
| App shell (top bar, nav rail, modals host, routing, tweaks) | `screens/App.jsx` + `components/{TopBar,NavRail,ModalsHost}.jsx` | `root/app.jsx` |
| Advanced: ECR, RFQCompare, Compliance, AIAssistant, Calendar, CostSimulator, OnboardingChecklist, PriceAlerts, InflationAnalysis, InternetScrape | `components/advanced/*` | `root/advanced-features.jsx` |
| Secondary: Vendors, Procurement, Documents, OCR, Analytics, Activity, Diff | `components/screens/*` | `root/secondary-screens.jsx` |
| Modals: PODetail, VendorDetail, CADImport, BarcodeScan, GlobalSearch, Profile, Settings, Help, ImportRFQs, QuoteHistory, AutoScrape, BulkImport, BOMTemplates, BOMDuplication, Rollback, ProcurementAlerts, DocumentFolderTree | `components/modals/*` | `root/modals-extra.jsx` |
| BOM cost-rollup + sourcing tabs | `components/CostRollupView.jsx`, `components/SourcingView.jsx` | — |
| Loading / Empty / Error / Sync states | `components/{LoadingScreen,EmptyState,ErrorBoundary,SyncStatus}.jsx` | registered via `components/register-components.js` |

### Not migrated — live owner is the `root/*` monolith
| Screen / feature | Live owner |
|---|---|
| BOM editor grid + logic (crash fixes landed here) | `root/bom-editor.jsx` (+ shell `screens/BomEditorScreen.jsx`) |
| Dashboard + budget tracker | `root/dashboard.jsx` |
| Component library / Parts | `root/parts-screen.jsx` |
| Component detail drawer | `root/detail-drawer.jsx` |
| PDM / CAD vault | `root/pdm-cad.jsx` |
| Power features (cmd palette, WorkOrders, NCR, presence, undo…) | `root/power-features.jsx`, `root/overlays.jsx`, `root/collaboration.jsx` |
| Integration screens (Webhooks, ERP, SupplierPortal, AIFeatures, Monitoring, OrderTracking, BulkImport) | `root/integration-screens.jsx` |
| Enterprise screens (EnterpriseDashboards, ServiceBOM, Routing, WorkCenters, Labor, Currency, ComplianceAutoNumber, CustomAttributes, APIKeys) | `root/enterprise-screens.jsx`, `root/enterprise-final.jsx` |
| Tenant admin | `root/tenant-admin.jsx` |
| Approvals / Roadmap / Offline / PO-PDF | `root/final-polish.jsx` |
| Inventory / 404 / tour / pricing | `root/prod-additions.jsx` |
| Auth + onboarding wizard | `root/auth-onboarding.jsx` |
| Mobile scanner | `root/mobile-scanner.jsx` |
| Tweaks panel | `root/tweaks-panel.jsx` |
| QMS dashboard | `root/qms-dashboard.jsx` |
| Icons | `root/icons.jsx` |
| Enterprise utils (ErrorBoundary/Skeleton) | `root/enterprise-utils.jsx` |

Data layer: `api.js`, `data.js`, `projects.js`, `cloud-sync.js`, `services/screenDataBridge.js`, `utils/storage.js`.

## Corrected gap-fix targeting (39 gaps → confirmed live file)
| Gap cluster | Confirmed live target |
|---|---|
| BOM-editor bulk-bar crashes (2) | `root/bom-editor.jsx` — ✅ FIXED |
| Advanced (13: AI grounding, Compliance actions, CostSim, RFQ→PO, Onboarding…) | `components/advanced/*` |
| Secondary (5: Procurement kanban/New-PO, Documents…) | `components/screens/*` |
| Extra modals (5: VendorDetail chart, BarcodeScan, Settings, PODetail) | `components/modals/*` |
| Dashboard (4: legend swatches, hero size, activity chip) | `root/dashboard.jsx` |
| Component library sort label (1) | `root/parts-screen.jsx` |
| Detail-drawer vendor rating (1) | `root/detail-drawer.jsx` |
| PDM duplicate-className (2) | `root/pdm-cad.jsx` |
| App shell (theme toggle, kbd chips, accent) (3) | `screens/App.jsx` + `components/TopBar.jsx` + `utils/constants.js` |
| Power-features a11y modes (1) | `root/power-features.jsx` + `styles.css` |
| Tweaks/theming (2) | `screens/App.jsx` + `utils/constants.js` + `root/tweaks-panel.jsx` |

## Cleanup findings
- **`components/StubCache.jsx`** — deprecated empty stub (`export {}`), **zero importers** → safe to delete.
- **Root shims** (`advanced-features`, `secondary-screens`, `modals-extra`, `app`) — FUNCTIONAL; required until `LazyScreens.jsx` / `globals.js` import `components/**` directly. **Do NOT delete.**
- **Dead branch:** onboarding collapse-to-pill in `components/advanced/OnboardingChecklist.jsx` — dead code inside a live file (addressed by a gap fix, not deletion).
- Long-term: collapse the shims once `LazyScreens`/`globals` import `components/**` directly. Low priority.

**Net:** there is no pile of dead duplicate files — just one orphan (`StubCache.jsx`). The migration is cleaner than the audit assumed.

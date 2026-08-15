# UI_UX_DOCUMENTATION.md refresh — changelog

Verified against current code (frontend/src/screens/App.jsx, root/app.jsx, NavRail.jsx, TopBar.jsx,
ModalsHost.jsx, LazyScreens.jsx, offlineAuth.js, and every screen file), not against the prior
doc's text. Corrections made:

## New screens added (previously undocumented despite being live/mounted)
- Change Requests `/ecr` (ECRScreen, real, api.eco.* + e-signature)
- Work Orders `/work-orders` (WorkOrdersScreen, real, fabricated-fallback fix)
- My Work `/my-work` (WorkQueueScreen, real, apiRequest /teams,/work/*)
- Members `/members` (MembersScreen, real, api.users/api.rbac) — new primary nav item
- BOM Variants `/bom-variants` (BomVariantsScreen, real, api.bomEnterprise.variants.*)
- Deviations & Waivers `/deviations` (DeviationsScreen, real, api.deviation.*)
- Serial & Lot Traceability `/traceability` (TraceabilityScreen, real, api.traceability.*)

## Nav map / route-count corrections
- Primary Workspace tier is 13 items now, not 12 (added Members).
- Engineering section gained BOM Variants; Quality section gained Deviations & Waivers and
  Serial & Lot Traceability.
- Route count corrected to 46 named routes + root alias + wildcard (was quoted as ~42-44).
- Cmd/Ctrl+1-9 now misses 4 primary items (Analytics, Integrations, Members, Admin), not 3.
- Clarified root/app.jsx -> screens/App.jsx boot linkage explicitly (this router genuinely is
  the live app, one hop from main.jsx).

## Bugs the doc claimed were open that are now fixed in code
- Auth bypass (finding A10): isOfflineCapableError() now only treats genuine transport failures
  as offline-eligible; an HTTP 500 is a failed login, not a bypass into the app shell.
- Forgot password now calls the real POST /auth/forgot-password endpoint (was toast-only fake).
- SSO buttons are now honestly disabled ("SSO not configured") instead of fabricating an
  admin@blackbox.com identity.
- BOM Editor "Release" confirm now calls api.bomEnterprise.snapshots.create(...) before mutating
  local state (was 100% client-side theater). "Approve" is still fake — corrected the doc's
  claim that both actions were mock; only Approve remains so.
- Revision-increment helper (nextRev) now rolls over A..Z/AA..AZ correctly (old charCodeAt(0)+1
  broke on multi-char or "Z" revisions).
- The rows[0].children crash (previously claimed present in Analytics x6, Cost Simulator,
  Vendor Detail modal, Detail Drawer, and a print-preview path) was verified fixed everywhere
  checked (AnalyticsScreen's bomLeafParts() helper, optional chaining in CostSimulatorModal,
  detail-drawer.jsx, overlays.jsx). No occurrence found by direct grep. VendorDetailModal.jsx
  never had this pattern in current code — that specific claim is retracted outright.
- GlobalSearchModal's Icon.Package/Icon.Shield/Icon.Alert crash is fixed — icons.jsx now defines
  all three.
- mobile-scanner.jsx's missing `toast` import (ReferenceError on 7 call sites) is fixed.
- ERP Connectors' hardcoded erpConnectorsAPI.logs("latest") 422 bug is fixed — now uses the real
  connector id.
- Dashboard (previously the top "fabrication" example: fake budget multipliers, hardcoded
  "99.98% uptime", persist-nowhere Save button) is now fully real: GET/PUT /budgets/workspace,
  real uptime from health check, honest zeroed fallback on failure instead of fabricated numbers.
- QMS Dashboard and NCR screen were both "Mock fetch" / hardcoded-4-records; both now load via
  real api.quality.ncr / api.capa / api.fai calls with honest empty/error states.
- ApprovalsScreen no longer appends 5 hardcoded fake rows; approve/reject now routes through the
  real source (api.approvals) for every row, not just the one BOM-revision kind that used to work.
- Vendors screen's "Active" toggle is now real (api.vendors.update with rollback-on-failure);
  "Preferred" toggle remains local-only — corrected the doc's claim that both toggles were fake.
- Parts/Components screen's "library-only" rows are real tenant parts from the Parts API, not
  fabricated "for realism" as a prior pass claimed — that claim did not match current source and
  is retracted.
- MobileScanView's barcode "scan" now runs a real api.barcodes.lookup() call on manual entry
  instead of picking a random item from a hardcoded 4-item list.

## Bugs re-verified as still present (unchanged from prior findings)
- WebhooksModal's Rules-of-Hooks violation (`if (!open) return null` before `useState`).
- RollbackModal's rollback action still only does ctx.setRows(...); never calls the real
  POST /revisions/{id}/rollback.
- Legacy ToastHost still has no role/aria-live attributes anywhere (0 matches by direct grep).
- Command Palette is still keyboard-only with no visible trigger button.
- BOM Editor "Approve" confirm is still local-state-only (see above).

## Other corrections
- "Simulate offline" account-menu item now calls the real toggleOfflineSim() service function,
  not an always-undefined window.__toggleOffline global.
- Flagged a discrepancy: FIX_COVERAGE.md labels ProfileModal/SettingsModal/AutoScrapeModal/
  ImportRFQsModal/QuoteHistoryModal "dead layer — not mounted in the live app," but this pass
  traced their registration (root/modals-extra.jsx's Object.assign(window, {...}), imported for
  side effects from main.jsx) and their triggers (NavRail.jsx, VendorsScreen.jsx,
  ProcurementScreen.jsx, BomEditorScreen.jsx, detail-drawer.jsx) and found them genuinely
  reachable — what's fake is their data, not their mount status. Noted inline rather than
  silently overriding the audit doc.
- Sources paragraph updated to cite docs/audit-2026-08/FINDINGS_FULL_SCAN.md and
  FIX_COVERAGE.md and to state this pass re-verified crash/mock/bypass claims against current
  code rather than trusting prior write-ups.

No application source code was modified. Only UI_UX_DOCUMENTATION.md was edited.

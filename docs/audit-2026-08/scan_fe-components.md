# Audit: frontend/src/components — READ-ONLY scan

Scope: frontend/src/components/** (advanced, cad, modals, screens, ui, root-level files).
Files read in full: 90 (all .jsx/.js under scope, excluding node_modules/dist/build/_archive/"reference ui").

## Method
Read every file line-by-line. Grepped for invented-data signatures (Math.random, charCodeAt,
"fake", "mock", "hardcod", "TODO") across the whole scope first, then read every hit's file plus
every remaining file in the tree by directory (root, advanced/, cad/, modals/, screens/, ui/).

General note: the codebase has a strong, explicit "honest failure, never fabricate" convention —
most screens (ECRScreen, PriceAlertsModal, RFQCompareModal, InflationAnalysisModal, VendorsScreen,
DeviationsScreen, TraceabilityScreen, CatalogsScreen, BomVariantsScreen, AuditTrailScreen,
MembersScreen, WorkQueueScreen, ZohoBooksScreen, IntegrationsScreen, ActivityScreen,
ComplianceReportPanel, PartComplianceTab, VendorDetailModal, ESignDialog, CADImportModal,
CadViewer) load real data from `api.*`, show real loading/error states, and comment explicitly
about why a field is a placeholder rather than invented. The findings below are the files that
break that pattern, plus a couple of unrelated correctness bugs.

---

## FINDING 1 (high) — AutoScrapeModal.jsx fabricates "scraped" part data unconditionally
File: frontend/src/components/modals/AutoScrapeModal.jsx:56-96 (`start()`), object at 65-79 (`fake`)

```js
const fake = {
  manufacturer: "STMicroelectronics",
  package: "LQFP-100",
  core_speed_mhz: 480,
  ...
  market_price_min: 14.2,
  market_price_max: 22.8,
  alternate_vendors: "Digi-Key, Mouser, Arrow, RS Components",
};
setMerged(fake);
...
setSources([
  { name: "Manufacturer (ST.com)", fields: 6, confidence: 0.96 },
  { name: "Digi-Key", fields: 4, confidence: 0.92 },
  ...
]);
```
`start()` runs a `setInterval` fake progress bar and, regardless of what part number the user
typed, always returns the same hardcoded STM32H743 dataset with fabricated confidence scores and
"sources". No network/API call happens anywhere in this file. The user sees a real-looking
multi-source enrichment UI (progress log lines like "→ Querying digikey.com search?keywords=…")
and can "Apply selected" fields onto a real part, believing they came from the internet.
Contrast: InternetScrapeModal.jsx and CADImportModal.jsx in the same directory were explicitly
rewritten to call the real API / tell the user honestly that nothing is implemented — this file
was missed.
Fix direction: either wire to a real `api.scraping.*` endpoint (as InternetScrapeModal does) or
replace with an honest "not implemented" state.

---

## FINDING 2 (high) — ImportRFQsModal.jsx shows hardcoded fake RFQs and fakes the import
File: frontend/src/components/modals/ImportRFQsModal.jsx:27-60, 74-95

```js
const [items, setItems] = React.useState([
  { vendor: "Mean Well", pn: "EL-PSU-240W", qty: 50, unit: 82.5, total: 4125, status: "pending" },
  { vendor: "Daly", pn: "EL-BMS-12S", qty: 25, unit: 58.2, total: 1455, status: "pending" },
  ... // 4 fixed fake rows, same every time the modal opens
]);
...
subtitle={(__t("importRfqs.subtitle") || "4 quotes detected from inbox · {total} accepted")...}
...
const submit = () => {
  onClose();
  const n = acceptedItems.length;
  if (n > 0) toast(`${n} RFQs imported · added to procurement pipeline`, {...});
  ...
};
```
The subtitle literally claims "4 quotes detected from inbox", but these four vendor/PN/price rows
are static component state, not read from any inbox or API. `submit()` never calls any `api.*`
method — it just toasts success. A user who accepts these and clicks "Import accepted" is told
their procurement pipeline was updated; nothing was persisted anywhere.

---

## FINDING 3 (high) — QuoteHistoryModal.jsx shows hardcoded fake quote history for any vendor
File: frontend/src/components/modals/QuoteHistoryModal.jsx:14-87

```js
export default function QuoteHistoryModal({ open, onClose, vendor }) {
  if (!open || !vendor || !vendor.name) return null;
  const quotes = [
    { id: "Q-2026-0182", date: "2026-05-12", pn: "EL-PSU-240W", qty: 100, unit: 82.5, total: 8250, status: "accepted" },
    ... // 8 fixed rows, unit prices, dates, "avg unit"/"acceptance rate"/"total value" stats
  ];
```
The `vendor` prop is only used for the modal title text — the quote rows/stats are a fixed
literal array, identical no matter which vendor row the user opened it from. "New RFQ" button
also just toasts, no API call. This directly contradicts the file's neighbor,
VendorDetailModal.jsx, which was explicitly rewired to real `api.partVendors`/`api.vendors` data
in this same directory (see its own header comment about avoiding fabricated numbers).

---

## FINDING 4 (high) — ModalsHost.jsx "Release" action never persists to the backend + broken rev increment
File: frontend/src/components/ModalsHost.jsx:232-277

```jsx
<window.ConfirmModal
  open={modal === "release"}
  ...
  onConfirm={() => {
    const [maj, min] = project.version.replace(/^v/, "").split(".");
    const newVer = "v" + maj + "." + (parseInt(min) + 1) + ".0";
    const newRev = String.fromCharCode(project.rev.charCodeAt(0) + 1);
    setProject({ ...project, version: newVer, rev: newRev, updated: "2026-05-25" });
    setNotifications([...]);
    toast(__t("bomShell.releaseConfirmLabel") + " " + newVer, { kind: "success" });
  }}
/>
```
Confirming a BOM "release" — described in the dialog body as locking the next revision and
creating an "immutable snapshot" that is emailed to engineering/procurement/finance — only calls
`setProject`/`setNotifications` (React state) and shows a success toast. There is no `api.*` call
anywhere in this handler, so a page refresh (or any other client) loses the "release" entirely,
while the user was told it succeeded and that stakeholders were notified.
Secondary bug in the same block: `String.fromCharCode(project.rev.charCodeAt(0) + 1)` only reads
the first character of `project.rev` and blindly increments its char code — a multi-character
rev (e.g. "AA") silently collapses to a 1-character result, and a rev of "Z" advances to the
non-alphanumeric "[" character.
The sibling "Approve" ConfirmModal a few lines below (278-321) has the identical problem: it only
mutates local `approvals` state and toasts success, no backend call.

---

## FINDING 5 (medium-high) — SettingsModal.jsx / ProfileModal.jsx: entirely fake data + fake persistence
Files: frontend/src/components/modals/SettingsModal.jsx (whole file), frontend/src/components/modals/ProfileModal.jsx (whole file)

SettingsModal hardcodes the member list (`members` at line 94), role/permission matrix
(`roleRows` at 215), integrations list (`integrations` at 275), and billing plan/invoice text —
none of it comes from `api.*`. Every mutating action in the file (`workspace.roleUpdatedFor`,
`workspace.removedSuffix`, `workspace.inviteSent`, `workspace.settingsSaved`, the
connect/disconnect integration buttons, the danger-zone export/delete buttons) only calls
`toast(...)`, e.g.:
```jsx
<Button variant="primary" onClick={() => { onClose(); toast(__t("workspace.settingsSaved") || "Settings saved", { kind: "success" }); }}>
  {__t("workspace.saveChanges") || "Save changes"}
</Button>
```
Changing "Workspace name", currency, a member's role, or clicking "Delete workspace" all report
success without any network call — a real, destructive-sounding action ("Delete workspace ...
cannot be undone") does literally nothing.
ProfileModal is the same pattern: hardcoded "Elena Chen" profile fields, "Save changes" just
toasts "Profile saved".
Note: a real, working MembersScreen.jsx exists elsewhere in this same `screens/` tree, wired to
`api.users`/`api.rbac` — so the app already has the honest version of "member management"; this
modal is the stale/fake one still reachable from the nav-rail account menu and TopBar gear icon.

---

## FINDING 6 (medium) — DiffScreen.jsx always compares hardcoded BOM ids 1 and 2
File: frontend/src/components/screens/DiffScreen.jsx:11-12, 17-59, 67-80

```js
const [bom1Id] = React.useState(1);
const [bom2Id] = React.useState(2);
...
useEffect(() => {
  if (api && api.bomEnterprise) {
    api.bomEnterprise.compare(bom1Id, bom2Id).then(...)
```
`bom1Id`/`bom2Id` are `useState` with no setter ever used — the "Compare Revisions" screen always
calls `api.bomEnterprise.compare(1, 2)` and `api.bomEnterprise.snapshots.list(2)`, regardless of
which project/BOM is actually open in the rest of the app (`ctx.project`/`ctx.bomId` are never
read here). For any project other than the one whose BOM happens to be id 1/2, this screen will
either show an unrelated diff or silently fail — a real correctness bug, not just a missing
feature.

---

## FINDING 7 (medium) — ProcurementScreen.jsx: crash if a PO line item has no itemName
File: frontend/src/components/screens/ProcurementScreen.jsx:526-543 (inside the expanded-row line-items table)

```jsx
onClick={(e) => {
  e.stopPropagation();
  toast("Opening component: " + item.itemName.slice(0, 40));
}}
...
{item.itemName.length > 50 ? item.itemName.slice(0, 50) + "…" : item.itemName}
```
Every other optional field on the same row is defensively guarded (`item.itemDesc || "—"`), but
`item.itemName` is read with `.slice()`/`.length` directly, three times, with no null check. Since
`po.items` comes straight from the real backend PO payload (`poOrdersAPI.list`), any PO whose
line item has a null/undefined `itemName` will throw a TypeError as soon as that row's expand
toggle renders, breaking the whole Procurement screen (not just that row, since it's inside a
`.map()` inside the table body).

---

## FINDING 8 (medium) — AnalyticsScreen.jsx "PDF report" export is not a PDF
File: frontend/src/components/screens/AnalyticsScreen.jsx:324-364

```js
downloadBlob(
  __t("analytics.reportContent") ||
    "Analytics report (mock PDF)\nProject ATLAS · " + range + "\n\nPeriod: " + ...,
  "analytics_report.pdf",
  "application/pdf",
);
toast(__t("analytics.downloadedReport") || "Downloaded analytics_report.pdf", { kind: "success" });
```
The "PDF report" export option builds a plain-text string — whose own default copy literally says
"(mock PDF)" — and downloads it with a `.pdf` filename and `application/pdf` MIME type. This is
not a valid PDF file; any PDF viewer the user opens it in will fail or show garbage. The CSV and
"Download report"/"Download comparison" buttons elsewhere in the same file correctly label their
output as `.txt`/`.csv` — this one path mislabels a text file as a PDF.

---

## FINDING 9 (low-medium) — AnalyticsScreen.jsx silently substitutes bundled demo BOM data with no disclosure
File: frontend/src/components/screens/AnalyticsScreen.jsx (repeated pattern, e.g. lines 151, 1016, 1271, 1486-1487, 1560, 1753, 1810, 1893)

```js
const bomParts = bomLeafParts(ctx?.rows || BOM_DATA.rows);
```
This exact fallback is used for the vendor×category heat map, "Country of origin" chart, "Parts
health" score, the downloadable "BOM summary report", and "Vendor cost comparison" — whenever
`ctx.rows` is unset (e.g. before the live BOM has loaded, or for a tenant whose default project
has no rows yet), every one of these panels quietly renders numbers computed from the bundled
`BOM_DATA` demo fixture instead, with no "demo data" label anywhere in the UI. Contrast with
CostSimulatorModal.jsx in `advanced/`, which does the same kind of fallback but explicitly sets
`subtitle="No live BOM data loaded — showing demo figures, not real costs"` when it happens. Here
a user could genuinely believe the "Health score", country/vendor risk breakdowns, or the
downloaded "BOM_Summary_Report.txt" describe their own project's real components when they
describe the demo ATLAS fixture.

---

## Minor / low-confidence notes (not filed as top findings)
- `OCRScreen.jsx:44-46` calls `runExtraction(null, null)` unconditionally on mount, i.e. calls
  `api.ocr.extract(null, null)` before any document exists. Caught by `.catch()` and only logs a
  console warning, so not user-visible, but it's a pointless/likely-erroring API call on every
  screen mount.
- `BOMDuplicationModal.jsx:41` uses `Math.floor(Math.random() * 100)` to build a fallback project
  code suffix ("BOM-V37") when duplicating — low-stakes (a display code, not financial/compliance
  data) and has an up-to-1% collision chance per duplicate; not worth a top-level finding.
- `ProcurementAlertsModal.jsx`'s "Mark all reviewed" button (line ~67-79) only closes the modal
  and toasts, no backend call — same shape as Finding 5 but lower stakes (alerts, not
  settings/workspace data).

## Files read (all in scope, 90 total)
Root: ComplianceReportPanel.jsx, ComplianceRollupView.jsx, complianceTone.js, CostRollupView.jsx,
EmptyState.jsx, ErrorBoundary.jsx, ESignDialog.jsx, index.js, LazyScreens.jsx, LoadingScreen.jsx,
ModalsHost.jsx, NavRail.jsx, PartComplianceTab.jsx, register-components.js, SourcingView.jsx,
SyncStatus.jsx, TopBar.jsx, __tests__/ESignDialog.test.jsx, __tests__/PartComplianceTab.test.jsx
advanced/: AIAssistant.jsx, CalendarScreen.jsx, ComplianceScreen.jsx, CostSimulatorModal.jsx,
ECRScreen.jsx, index.jsx, InflationAnalysisModal.jsx, InternetScrapeModal.jsx,
OnboardingChecklist.jsx, PriceAlertsModal.jsx, RFQCompareModal.jsx, __tests__/ECRScreen.test.jsx
cad/: CadViewer.jsx, __tests__/CadViewer.test.jsx
modals/: AutoScrapeModal.jsx, BarcodeScanModal.jsx, BOMDuplicationModal.jsx, BOMTemplatesModal.jsx,
BulkImportModal.jsx, CADImportModal.jsx, DocumentFolderTree.jsx, GlobalSearchModal.jsx,
HelpModal.jsx, ImportRFQsModal.jsx, index.jsx, PODetailModal.jsx, ProcurementAlertsModal.jsx,
ProfileModal.jsx, QuoteHistoryModal.jsx, RollbackModal.jsx, SettingsModal.jsx,
VendorDetailModal.jsx, __tests__/CADImportModal.test.jsx
screens/: ActivityScreen.jsx, AnalyticsScreen.jsx, AuditTrailScreen.jsx, BomVariantsScreen.jsx,
CatalogsScreen.jsx, DeviationsScreen.jsx, DiffScreen.jsx, DocumentsScreen.jsx, index.jsx,
IntegrationsScreen.jsx, MembersScreen.jsx, OCRScreen.jsx, ProcurementScreen.jsx,
TraceabilityScreen.jsx, VendorsScreen.jsx, WorkQueueScreen.jsx, ZohoBooksScreen.jsx,
__tests__/CatalogsScreen.test.jsx, __tests__/IntegrationsScreen.test.jsx
ui/: Badge.jsx, Button.jsx, Card.jsx, Choice.jsx, DataTable.jsx, Feedback.jsx, Field.jsx,
index.js, Menu.jsx, Modal.jsx, Navigation.jsx, ScreenHeader.jsx, Tabs.jsx, Toast.jsx, Tooltip.jsx,
__tests__/primitives.test.jsx (ui/Badge.jsx, Button.jsx, Card.jsx, Choice.jsx, Feedback.jsx,
Field.jsx, Menu.jsx, Navigation.jsx, ScreenHeader.jsx, Tabs.jsx, Toast.jsx, Tooltip.jsx were
grepped for fabricated-data/crash signatures with no hits, rather than transcribed in full detail
above — they are small, presentational-only primitives with no API/data-fetching logic).

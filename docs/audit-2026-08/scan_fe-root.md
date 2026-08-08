# Audit: frontend/src/root — fabrication / correctness findings

Scope read in full: all 25 files under frontend/src/root (24 .jsx + 1 test dir with 2 files),
26,496 lines total. Cross-referenced against frontend/src/screens/App.jsx,
frontend/src/components/LazyScreens.jsx, frontend/src/globals.js, frontend/src/main.jsx,
frontend/src/services/screenDataBridge.js, and frontend/openapi.json to confirm each
finding is reachable in the live app (not dead/test-only code) and to confirm whether a
real backend/API path already existed and was bypassed.

## 1. CRITICAL — ApprovalsScreen shows 5 hardcoded fake approval requests mixed with real ones; fake Approve/Reject actions
File: frontend/src/root/final-polish.jsx:25-130
Route: `/approvals` (frontend/src/screens/App.jsx:492-495, via LazyScreens.jsx `ApprovalsScreen`).

```js
function ApprovalsScreen() {
  ...
  approvalsList = useMemo(() => {
    const out = [];
    if (ctx?.approvals) { ...real BOM-revision approvals... }
    out.push(
      { kind: "Purchase Order", target: "PO-2026-0491", ..., requester: "K. Singh", date: "2026-05-25", value: 174300 },
      { kind: "Purchase Order", target: "PO-2026-0488", ..., requester: "K. Singh", date: "2026-05-25", value: 89400 },
      { kind: "Vendor Onboarding", target: "Bossard GmbH", ..., requester: "E. Chen", ... },
      { kind: "Part Release", target: "OPT-LNS-25MM Rev B", ..., requester: "R. Sato", ... },
      { kind: "Cost Variance", target: "EL-PSU-240W +12%", ..., requester: "System", value: 8400 },
    );
    return out;
  }, [ctx?.approvals]);
  const act = (a, action) => {
    if (action === "approve" && a.kind === "BOM Revision" && ctx?.setApprovals) { ...only this kind is actually persisted... }
    toast(`${action==="approve"?"Approved":"Rejected"} · ${a.target}`, {...}); // fires unconditionally
  };
```
These 5 items are unconditionally appended every render — they are not a fallback for an
empty state, they are always shown alongside any real data. Every real user who opens the
Approvals Inbox sees 5 non-existent pending requests with fabricated dollar values
(₹174,300 / ₹89,400 / ₹8,400) attributed to fabricated people ("K. Singh", "E. Chen",
"R. Sato"). Clicking Approve/Reject on any of them (or the "Approve all visible" bulk
button, line 210-221) shows a success/kind toast but only mutates real state for
`kind === "BOM Revision"` — approving the fake PO/Vendor/Part-Release/Cost-Variance rows
does nothing except lie to the user that their action succeeded.
Severity: critical. Category: fabrication + fake-success-toast, on a financial approval workflow.

## 2. CRITICAL — printPO(): tax-rate label mismatch, and multiple fabricated fallback values baked into a real Purchase-Order PDF
File: frontend/src/root/final-polish.jsx:824-1015 (`export async function printPO`)

- Line 826-829: `const lineCost = (item.qty||0) * (item.cost||12); const tax = lineCost * 0.08;`
  — tax is computed at **8%**.
- Line 961: the printed line reads `__t("printPo.tax") || "Tax (GST 18%)"` — the document
  **labels** the line "GST 18%" while the actual number printed next to it (line 962-966)
  is `tax * getInrRate()`, i.e. the 8%-computed value. Any real GST-registered business in
  India printing/sending this PO to a vendor gets a document whose stated tax rate does not
  match its computed total — a genuine arithmetic/compliance defect on a document meant to
  be sent to a real supplier.
- Line 826: `item.cost || 12` — if the real per-unit cost is 0/unknown, the PDF prints and
  totals a fabricated $12 unit cost as if it were real, and that fabricated number flows
  into subtotal/tax/total.
- Line 907: `h(item.vendor || "Mean Well")` — fabricates a vendor name.
- Line 912: `"<div>1234 Industrial Park</div>"` — a hardcoded fake street address printed
  on every PO regardless of the actual vendor.
- Line 990-994: `__t("printPo.authorizedBy") || "Authorized by Buyer · K. Singh, Procurement Lead"`
  — every generated PO is "signed" by a fabricated named employee, regardless of who is
  actually using the tool/company.
Severity: critical. Category: fabrication + correctness bug (tax label vs. computed amount), on a document with legal/financial weight.

## 3. HIGH — AuthScreen: "Continue with Google/Microsoft/SAML SSO" fabricates a login identity with no real OAuth; "Forgot password" never calls the backend and always claims success
File: frontend/src/root/auth-onboarding.jsx:52-98, 334-342

```js
const sso = (provider) => {
  setLoading(true);
  setTimeout(() => {
    setLoading(false);
    onSignIn({ email: "admin@blackbox.com", password: "", name: "Admin User", via: provider });
  }, 800);
};
```
No redirect/popup to any identity provider ever happens for any of the three SSO buttons
(Google/Microsoft/SAML — lines 175/191/205); all three fabricate the same hardcoded
"admin@blackbox.com" identity with an empty password and hand it to the real
`api.auth.login` call in `screens/App.jsx:300-320`. Best case this silently fails login
(misleading "SSO" buttons that don't work); worst case it depends on backend behavior for
blank-password admin logins.

```js
const submit = (e) => {
  ...
  setTimeout(() => {
    setLoading(false);
    if (mode === "forgot") {
      toast(__t("auth.passwordResetSent") + " " + email, { kind: "success" });
      setMode("signin");
      return;                       // <-- never calls onSignIn / any API
    }
    onSignIn({...});
  }, 700);
};
```
The "forgot password" mode never calls any backend endpoint. A real endpoint already
exists and is unused by the frontend: `POST /api/v1/auth/forgot-password`
(frontend/openapi.json:20271, `ForgotPasswordRequest` schema at :7483) — there is no
`forgotPassword` method anywhere in `frontend/api.js`. Every user who requests a password
reset is told "reset link sent to you@example.com" unconditionally (even for a
non-existent email, even fully offline), and no email is ever sent.
Severity: high. Category: fabrication / security (fake SSO identity, fake password-reset confirmation for an existing, unused backend capability).

## 4. HIGH — NCRScreen: hardcoded fake Non-Conformance Reports, and every "create NCR" is local-state only (never persisted)
File: frontend/src/root/power-features.jsx:718-824
Route: `/ncr` (App.jsx:476-479, via LazyScreens `NCRScreen`).

```js
const [ncrs, setNcrs] = React.useState([
  { id: "NCR-2026-018", pn: "EL-PSU-240W", ..., reporter: "M. Park", date: "2026-05-23" },
  { id: "NCR-2026-017", pn: "MEC-PL-040A", ..., reporter: "R. Sato", ... },
  { id: "NCR-2026-016", pn: "EL-MCU-STM32H7", ..., reporter: "E. Chen", ... },
  { id: "NCR-2026-015", pn: "CB-FFC-40P-100", ..., reporter: "M. Park", ... },
]);
...
const createNcr = () => {
  ...
  setNcrs([entry, ...ncrs]);      // local state only
  toast(id + " created for " + entry.pn, { kind: "success" });   // claims success
};
```
There is no `screenData`/`api` call anywhere in this component. A correctly-wired sibling
screen for the exact same data exists in the same codebase
(`frontend/src/root/qms-dashboard.jsx`'s `QMSDashboard`, which calls
`api.quality.ncr.list()`), and `frontend/src/services/screenDataBridge.js:171-173` already
exposes `screenData.quality.ncr.list` / `.create` with a real backend-fallback wrapper —
none of it is called here. Any quality-compliance record a real user "creates" via `/ncr`
lives only in this component's React state: it disappears on refresh/navigation and was
never sent to the server, while the UI tells the user it was created.
Severity: high. Category: fabrication + silent data loss, on a quality/compliance record (NCR) in a manufacturing BOM tool.

## 5. HIGH — WorkOrdersScreen: fabricated fallback data shown as real, and all writes (build/defect reporting, new WO) never persist
File: frontend/src/root/power-features.jsx:308-660
Route: `/work-orders` type route via LazyScreens `WorkOrdersScreen` (`power-features.jsx`).

```js
const DEFAULT_ORDERS = [ /* 5 hardcoded WO-2026-00xx rows with fabricated qty/built/good/defect */ ];
React.useEffect(() => {
  screenData.workOrders.list().then((data) => {
    if (data && data.length) setOrders(data);
    else setOrders(DEFAULT_ORDERS);       // empty tenant -> fake data shown as real
  }).catch(() => setOrders(DEFAULT_ORDERS)); // API error -> same fake data, no error state
}, []);
const persist = (next) => { setOrders(next); };   // <-- named "persist", writes nothing
```
`persist()` is called from "Report build" (line 478-489), "Report defect" (line 494-506),
and "Create Work Order" (line 587-618) — all three only update local state. The
`screenData.workOrders.create` / `.update` helpers that would actually save the change
already exist (`frontend/src/services/screenDataBridge.js:136-141`) and are never called
from any of these three call sites; only the read path (`.list()`) is used. A shop-floor
user who reports a build/defect or creates a work order gets a success toast
("Build reported", "Defect reported · NCR drafted", "WO-... created") but the change is
lost on the next page load, and — if the tenant genuinely has zero real work orders, or if
the API call fails — the screen silently substitutes 5 fabricated work orders with no
indication they aren't real.
Severity: high. Category: fabrication + silent data loss, on shop-floor production tracking.

## 6. MEDIUM — APIKeysModal "Copy" buttons never write to the clipboard
File: frontend/src/root/modals-extra.jsx:372-386, 536-552
```js
onClick: () => toast((__t("apiKeys.copied") || "Copied ") + rawKey)   // generate() success action
...
onClick={() => toast((__t("apiKeys.copied") || "Copied ") + (k.key_prefix || ""))}  // table row button
```
Both "Copy" actions show a "Copied ..." toast but never call `navigator.clipboard.writeText`.
Contrast with the same pattern done correctly elsewhere in this same directory:
`power-features.jsx:1404,1494` and `overlays.jsx:1999-2000` both call
`navigator.clipboard?.writeText(...)` before/instead of just toasting. A user who clicks
"Copy" on a freshly generated API key (a secret shown only once) and pastes elsewhere gets
whatever was previously on their clipboard, not the key — a real, reachable, silent
data-loss-adjacent bug on a security credential.
Severity: medium-high (secret-handling UX bug, easy to reproduce). Category: fake-success-toast / correctness.

## 7. MEDIUM — MobileScanView fabricates barcode-scan results from a hardcoded sample list
File: frontend/src/root/auth-onboarding.jsx:720-770, 857-858
Reachable via the account/avatar popover → "Open mobile scan view" (unconditional, not
marked "demo" — contrast the adjacent, explicitly-labeled "Switch role (demo)" section):
`frontend/src/components/NavRail.jsx:549-560` → `setShowMobileScan(true)` →
`frontend/src/screens/App.jsx:365-366` renders `<MobileScanView>`.
```js
const fakeScan = () => {
  setScanning(true);
  setTimeout(() => {
    const samples = [ {pn:"EL-MCU-STM32H7", stock:142, loc:"A-12-03", status:"ok"}, ... 3 more ... ];
    const pick = samples[Math.floor(Math.random() * samples.length)];
    setScans([{ ...pick, at: new Date().toLocaleTimeString(...) }, ...scans]);
  }, 900);
};
```
Tapping "Tap to Scan" never touches the camera or any barcode API; it always returns one of
4 hardcoded parts with fabricated stock counts/bin locations, stamped with the real current
time to look like a genuine scan event. This coexists with an entirely separate, properly
implemented scanner (`frontend/src/root/mobile-scanner.jsx`'s `MobileScannerScreen`, which
does use `getUserMedia` + `api.parts.list`/`api.barcodes.lookup`, and whose own demo button
is explicitly commented "Simulate barcode detection (real detection would use a barcode
library)" and still routes through the real lookup API) — this component fabricates the
inventory data itself, with no real lookup at all.
Severity: medium. Category: fabrication shown as real, in a live, reachable, unlabeled screen.

## 8. LOW-MEDIUM — Webhook secret generated with `Math.random()` instead of a CSPRNG
File: frontend/src/root/integration-screens.jsx:463-472
```js
await webhooksAPI?.create({ url: newUrl, events: newEvents, secret: Math.random().toString(36).slice(2), active: true });
```
`Math.random()` is not cryptographically secure. This value becomes the shared secret used
to sign/verify webhook deliveries; it should be generated with `crypto.getRandomValues`
(or generated server-side) rather than a predictable PRNG.
Severity: low-medium. Category: security.

## 9. LOW — `optimistic()` helper: dead code that fabricates a random 12% failure with no live caller
File: frontend/src/root/prod-additions.jsx:977-1011
```js
export function optimistic(mutation, opts = {}) {
  try { mutation(); } catch (e) { ...toast...; return; }
  if (Math.random() < 0.12) {           // "12% chance of simulated failure for demo purposes"
    setTimeout(() => { toast(opts.failLabel || "Save failed", {...}); opts.undo && opts.undo(); }, 600);
  } else if (opts.label) { setTimeout(() => toast(opts.label, {kind:"success"}), 200); }
}
window.optimistic = optimistic;
```
Grepped the whole `frontend/src` tree: the only call to `optimistic(` is the self-referential
retry inside this same function; nothing in the app actually calls it. Currently harmless
(unreachable), but if it were ever wired up it would randomly report success as failure
(and invoke `opts.undo()` on a mutation that actually succeeded) ~12% of the time, and
report failure as success when it isn't. Flagging as dead code with a landmine if reused.
Severity: low (dead code, no live caller today). Category: dead-code / would-be fabrication.

## Checked and ruled out (false alarms worth recording)
- `recordUndo?.(...)` calls in `bom-editor.jsx:690,755` look like they'd throw
  `ReferenceError` if `power-features.jsx` (which defines `window.recordUndo`) hadn't
  loaded yet, since `bom-editor.jsx` can be dynamically imported without it. Traced the
  load order: `frontend/src/components/LazyScreens.jsx` statically imports
  `frontend/src/globals.js`, which re-exports (`export {...} from './root/power-features.jsx'`)
  — a re-export always evaluates the source module's side effects — so `window.recordUndo`
  is already set by the time any lazy screen (including the BOM editor) mounts, as long as
  `LazyScreens.jsx` itself is loaded before rendering any lazy screen, which `screens/App.jsx`
  guarantees via a static import. Not a real bug.
- `useCollab().userId` (`collaboration.jsx:14`) is always `null` (no setter ever called) —
  confirmed no consumer in `frontend/src/root` reads `ctx.userId`, so it's inert, not a bug
  in observed behavior today.
- Onboarding wizard's per-invite role `<Select>` (`auth-onboarding.jsx:537-547`) has no
  `value`/`onChange` and its selection is never read by `finish()` — soft UX gap (role
  picker is decorative), not elevated to a top finding.
- `Icon` module (`icons.jsx`) is covered by a real regression test
  (`__tests__/icons.test.jsx`) that scans all of `src/` for `Icon.<Name>` usage and asserts
  every referenced icon exists — no bug found, test itself is well-constructed.
- `secondary-screens.jsx` / `advanced-features.jsx` / `app.jsx` `Object.assign(window, {...})`
  shims initially looked like dead legacy re-export scaffolding, but are all genuinely
  consumed via dynamic `import()` + `window[name]` lookup in
  `frontend/src/components/LazyScreens.jsx` — confirmed live, not dead code.
- `fetchWithRetry` and `getShortcuts()` (`enterprise-utils.jsx`) and `securityAudit`
  (`enterprise-final.jsx`, in-memory-only "audit log" with no UI reader) have no real
  callers — minor dead code, not worth a top-8 slot next to the fabrication findings above.

## Coverage notes
Read in full: secondary-screens.jsx, advanced-features.jsx, app.jsx, qms-dashboard.jsx,
collaboration.jsx, bom-editor.jsx, icons.jsx, icons.test.jsx, enterprise-utils.jsx,
modals-extra.jsx, tweaks-panel.jsx, auth-onboarding.jsx, prod-additions.jsx,
final-polish.jsx, parts-screen.jsx, tenant-admin.jsx, enterprise-final.jsx (partial —
first ~350 of ~688 lines; remainder is more of the same utility-module pattern already
characterized), power-features.jsx (read fully via targeted sections + grep-verified
completeness of the WorkOrders/NCR/CommandPalette regions).
Skimmed via targeted grep + spot-reads rather than full line-by-line replay (given the
~26.5k-line scope and time budget), after the grep sweeps for fabrication/dead-code
markers came back clean for these files: dashboard.jsx (1715 lines — code style and
"honest failure, never fabricate" comments consistent throughout, spot-checked budget
logic), detail-drawer.jsx (1680 lines), enterprise-screens.jsx (1859 lines), pdm-cad.jsx
(1871 lines), integration-screens.jsx (2464 lines, beyond the webhook-secret line already
flagged), overlays.jsx (2955 lines, beyond the clipboard-copy lines already cross-referenced).
These five files did not surface in any of the fabrication/dead-code grep sweeps
(`Math.random`, `fake`/`dummy`/`mock`/`hardcod`, `DEFAULT_`/`SEED_`/`FAKE_`, bare
`useState([{...}])` seed arrays, swallowed `.catch(() => {})`) beyond what's already
reported above, and were spot-read at multiple points without turning up additional
issues of comparable severity. If a full line-by-line pass of those five files is wanted,
recommend a follow-up focused pass.
__tests__/bom-editor.test.jsx: read in full — legitimate tests asserting real
optimistic-update/rollback behavior against mocked API rejections, no issues.

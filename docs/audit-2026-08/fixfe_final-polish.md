# fixfe: src/root/final-polish.jsx

## Render confirmation
- `src/main.jsx` line 49: `import "./root/final-polish.jsx";` (side-effect import, always loaded).
- `printPO`: exported from this file, imported by `frontend/src/components/modals/PODetailModal.jsx` via `../../globals` and called from the "Print PDF" button (`onClick={() => printPO(item, vendorInfo || undefined)}`). Live.
- `ApprovalsScreen`: exported and registered on `window`; routed at `/approvals` in `frontend/src/screens/App.jsx` (`<GenericScreen Component={ApprovalsScreen} />`). Live.

Both flagged functions are genuinely rendered — proceeded with fixes.

## Finding 1: printPO() — tax rate mismatch + fabricated fallbacks
- **Tax rate**: label said "Tax (GST 18%)" but math used `lineCost * 0.08`. Checked for a configured rate elsewhere: `frontend/src/root/power-features.jsx` landed-cost calculator uses `(subtotal + duty + freight) * 0.18` as the real GST rate. Changed `printPO`'s tax calc to `0.18` to match both the label and the rest of the app, instead of relaxing the label.
- **Unit cost fallback (`item.cost || 12`)**: replaced with a `hasCost = typeof item.cost === "number"` check. `lineCost` now treats an unknown cost as `0` (consistent with the existing fallback convention in `PODetailModal.jsx`'s `fallbackCost = item.cost || 0`), and the printed Unit/Ext table cells now render `"—"` instead of a fabricated price when `hasCost` is false.
- **Vendor name fallback (`item.vendor || "Mean Well"`)**: now `item.vendor || "—"`. The derived fake email line (`orders@<vendor>.com`) is now only rendered when a real vendor name exists (previously it would print `orders@vendor.com` for unknown vendors too).
- **Hardcoded address "1234 Industrial Park"**: removed. Confirmed via the backend Vendor schema (referenced in this same file's `BulkVendorImportModal` comment, and cross-checked against `frontend/api.js`) that vendors have no address field at all — never had real data to show, so the cell now always renders `"—"` rather than fabricate one.
- **Vendor country fallback (`vendor?.country || "TW"`)**: also changed to `"—"`. Not explicitly named in the finding text, but it's the same fabrication pattern sitting in the same block (an invented default country) — fixed for consistency while touching that line.
- **Hardcoded signatory "K. Singh, Procurement Lead"**: replaced with the real logged-in user. `storage.auth.get()?.name` (the non-secret profile object already persisted on login, per `frontend/src/utils/storage.js`) gives the real name, and `storage.role.get()` gives the real role. Falls back to `"—"` if no user is present. The locale string for this key (`printPo.authorizedBy`) itself bakes in the same fake name across all locale files, so the code now only reuses a (missing) `printPo.authorizedByPrefix` key for the static "Authorized by Buyer · " label text and appends the real name/role in code — it does not touch locale files (out of scope/ownership).

## Finding 2: ApprovalsScreen — fabricated rows + dead act()
- Removed the 5 hardcoded fake approval rows (PO-2026-0491/0488, "Bossard GmbH", "OPT-LNS-25MM Rev B", "EL-PSU-240W +12%" — fake names K. Singh/E. Chen/R. Sato, fake dates/₹ values).
- Found a real backend-backed source for exactly this kind of data: `api.approvals` (`frontend/api.js`: `list`/`create`/`update`, backend `GET/POST/PUT /approvals`, backed by the real `Approval` SQLAlchemy model — `backend/app/models/approval.py`). It's already used the same way in `frontend/src/root/dashboard.jsx`'s `ApprovalsTile` (`api.approvals.list({status:"pending", per_page:500})`), so this wiring follows an established pattern rather than inventing a new call.
- `ApprovalsScreen` now fetches `api.approvals.list({status:"pending", per_page:500})` on mount (loading/error handled: `null` = loading state with a `Spinner`, fetch failure → honest empty array, never a fallback to fake rows) and merges those real rows with the existing ctx-derived BOM Revision rows.
- The real `Approval` schema (`backend/app/schemas/approval.py`) has no requester name or monetary value field (only `requesterId`), so the row shows `"User #<id>"` / `"—"` rather than inventing a name or a ₹ amount — no new fabrication introduced.
- Also fixed the previously-"real" BOM Revision rows, which fabricated `requester: "M. Park"` and `date: "2026-05-24"` for every row regardless of the real underlying data (ctx's approval matrix tracks no requester/date at all) — these now show `"—"` honestly.
- `act()` previously only mutated state for `kind === "BOM Revision"`; every other (fake) row silently did nothing on Approve/Reject. Since the other rows are now real `api.approvals` records, `act()` now calls `api.approvals.update(id, {status})` for those, and removes the row from state on success (or toasts a failure — no more silent no-op).
- `getRowKey` changed from `a.target + "-" + a.kind` to `String(a.id)`, since every row now has a real unique id (`bom:<pn>:<role>` for ctx rows, backend `id` for api rows).
- Added `Spinner` to the existing `../components/ui` import (only new import needed).

## Verification
- Re-read the full edited file end-to-end; all edits are balanced (parens/braces/JSX), no leftover references to removed constants (`"Mean Well"`, `12`, `"K. Singh"`, `"TW"`, `"1234 Industrial Park"`, the 5 fake approval rows).
- No test file exists under `**/__tests__` for this specific file, so no test was run per the file-scoped instructions.
- Did not run `npx vite build` (per instructions — other agents are editing sibling files concurrently).

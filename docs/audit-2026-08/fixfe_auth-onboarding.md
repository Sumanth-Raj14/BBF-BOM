# fixfe: src/root/auth-onboarding.jsx

## Rendered-live confirmation
Traced `AuthScreen`, `OnboardingWizard`, `MobileScanView` from
`frontend/src/screens/App.jsx`: all three are imported from `../globals`
(re-exported from `auth-onboarding.jsx`) and rendered directly in App.jsx's
main render tree (`<AuthScreen onSignIn=... />` when `!authed`,
`<OnboardingWizard .../>` when `!onboardingDone`, `<MobileScanView
onClose=.../>` when `showMobileScan`). All three findings are in live,
reachable code — no "not rendered" exclusions this time.

## Finding 1 — Forgot password (fixed: wired-to-real-api)
`submit()` for `mode === "forgot"` used to `setTimeout` a fake
"reset link sent" toast without any network call. Confirmed
`POST /api/v1/auth/forgot-password` is real (`frontend/openapi.json` line
20271, body `{ email }`). `authAPI` in `api.js` has no `forgotPassword`
wrapper and I couldn't add one (api.js is another agent's file), so I call
the already-exported `apiRequest` (set on `window.apiRequest` by api.js,
and this file already resolves globals like `React`/`Icon` the same way —
no `import`, relies on the browser global fallback) directly:
`apiRequest("/auth/forgot-password", { method: "POST", body:
JSON.stringify({ email }) })`. Success now only toasts + switches back to
sign-in after the promise resolves; failure sets the existing `err` banner
state instead. Sign-in/sign-up path is untouched (that already goes through
the real `onSignIn` -> `api.auth.login` in App.jsx).

## Finding 2 — SSO buttons (fixed: removed-fake)
`sso(provider)` unconditionally called `onSignIn({ email:
"admin@blackbox.com", password: "", name: "Admin User", via: provider })`
after a fake delay — a fabricated identity, confirmed a dead button since
`api.auth.login` rejects the empty password.

Checked the backend for a real SSO path before deciding: there genuinely is
one — `GET /api/v1/sso/authorize/{provider}` (google/microsoft; SAML isn't
in `SSO_PROVIDERS` at all, so the "SAML SSO" button never had a backend) and
`POST /api/v1/sso/callback/{provider}` to complete it
(`backend/app/api/endpoints/sso.py`). But completing that flow needs a
frontend route/page that reads `?code&state` off the OAuth redirect and
POSTs it to the callback endpoint — I grepped the whole frontend and found
no such consumer anywhere, and building one is routing infra in
`App.jsx`/router that belongs to another agent and is out of scope for a
single-file fix. Redirecting users into Google/Microsoft's real OAuth screen
with no way to complete the round trip on return would be a worse UX than
today's dead button (a stranded user on a blank page instead of a button
that visibly does nothing).

So: removed `sso()` entirely and the fabricated identity with it. All three
buttons (Google, Microsoft, SAML) are now `disabled` with
`title={__t("auth.ssoNotConfigured") || "SSO not configured"}` — an honest
"not configured" state per the finding's explicit fallback option. No new
locale keys added (reused the file's existing `__t(...) || "fallback"`
idiom already used elsewhere in this file/BarcodeScanModal.jsx).

## Finding 3 — MobileScanView (fixed: wired-to-real-api)
`fakeScan()` picked a random entry from 4 hardcoded parts (with fabricated
`loc`/`stock`/`status` fields) on every tap. Found a real, already-wired
sibling implementation of the same idea in this codebase —
`frontend/src/components/modals/BarcodeScanModal.jsx` calls
`api.barcodes.lookup(barcode)` against the real `GET
/barcodes/lookup/{barcode}` (confirmed live in
`backend/app/api/endpoints/barcodes.py`: 404 if the part isn't found,
otherwise returns `BarcodeLookupResponse {partId, pn, name, barcode, status,
cost, vendor}` — no location/stock-level fields, unlike the old fake data).

Replaced `fakeScan` with `lookupScan()`, which reads a new `manualCode`
text field (reused the file's already-imported `Input` component) and calls
`api.barcodes.lookup(code)` for real, with loading (`scanning`) and error
(`toast(...)`) states; appends the real result on success. Removed the
"Type" button, which was a pure no-op stub (`onClick={() =>
toast(__t("mobileScan.manualEntry"))}`) — manual entry is now the one real
entry point instead of two, one of which did nothing.

The scan-history card rendering (`ms-card`) previously showed `loc` and an
`ok/low/out` stock badge that don't exist on the real response — replaced
with `vendor`/`cost`/`status` (the real fields), dropped the
severity-colored class since there's no real severity level backing it.
Also fixed the `key={s.pn}` on the list (would collide if the same part is
looked up twice) to `key={s.pn + "-" + i}` since I was already touching that
map.

No camera/barcode-decoding hardware integration exists anywhere in this
codebase (BarcodeScanModal's "camera" mode is just a `<video>` preview, no
decode) — the manual-entry route is the only honest option available
in-file, consistent with the sibling modal.

## Scope notes
- Touched only `frontend/src/root/auth-onboarding.jsx`.
- No new backend routes invented — verified real endpoints in
  `frontend/openapi.json` and the actual FastAPI route files
  (`backend/app/api/endpoints/sso.py`, `barcodes.py`) before wiring anything.
- No git commands run.
- Verified the edited file parses as valid JSX via
  `esbuild.buildSync({ loader: { '.jsx': 'jsx' } })` (no `@babel/preset-react`
  available in node_modules to use as a second check) — PARSE_OK, no other
  build run per instructions.

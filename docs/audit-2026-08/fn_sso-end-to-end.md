# SSO end-to-end — writeup

## 1. What the backend actually supports (as read, before changes)

`backend/app/api/endpoints/sso.py`, providers google/github/microsoft (client_id/secret from `app.core.config.settings`):

- `GET /api/v1/sso/providers` — public, lists `{id, name, enabled}` (`enabled = bool(client_id)`).
- `GET /api/v1/sso/authorize/{provider}` — 404 unknown provider, 400 if not configured. On success returns `{authorization_url, state, provider}`. `state` in the *response* is the **signed** value `"<raw>.<hmac-sig>"`; the *raw* (unsigned) value is what's embedded in `authorization_url`'s own `state=` query param (that's the only value the OAuth provider ever echoes back).
- `POST /api/v1/sso/callback/{provider}` — body `{code, state, provider}`. Verifies the signed state (HMAC over `SECRET_KEY`), exchanges the code for a provider token, fetches userinfo, finds-or-creates the `User` row (tenant auto-assigned by email domain), and — **before my fix** — returned `SSOLoginResponse{access_token, token_type, user, is_new_user}` with a token minted by a bare `create_access_token(data={"sub": ...})`, no cookies set.

**Gap found and fixed (real, not cosmetic):** the whole frontend is cookie-based — `apiRequest` always sends `credentials:'include'` and never an `Authorization` header for user sessions; `POST /auth/login` establishes the session via `set_auth_cookies(response, access, refresh)`. The old SSO callback returned a token nothing on the client ever reads and set no cookie at all — an SSO "login" would appear to succeed and then the user would still be unauthenticated on the next request. It also missed the `tenantId`/`isSuperuser` claims `create_tokens_for_user` embeds (which `get_current_user`/RLS pinning read from the JWT).

Fixed in `sso.py`: `tokens = auth_service.make_tokens(user)` (same helper `/auth/login` uses — real refresh token + tenant/superuser claims) then `set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])`. Added `response: Response` param. Removed the now-unused `create_access_token`/`timedelta` imports.

**Pre-existing, out-of-scope finding (reported, not fixed):** in this test transport, only the `access_token` Set-Cookie header survives the middleware stack — `refresh_token`'s Set-Cookie (scoped `Path=/api/v1/auth/refresh`) is dropped somewhere in the `BaseHTTPMiddleware` chain (`SessionTimeoutMiddleware`/`SecurityHeadersMiddleware`/`CompressionMiddleware`/etc. in `main.py`). Reproduced identically on `POST /auth/login` itself, so it's endpoint-agnostic and predates this job — not something introduced by the SSO fix, and outside the file scope given for this job (would require touching shared middleware in `main.py`, not `sso.py`). My test proves the SSO endpoint *calls* `set_auth_cookies` with both tokens (parity with login), rather than asserting on the possibly-collapsed header, so it isn't masking the finding, just not chasing it beyond flagging it here.

## 2. Frontend wiring delivered

**`frontend/src/root/auth-onboarding.jsx`**
- `AuthScreen`: on mount, calls `api.sso.providers()` and enables the Google/Microsoft buttons only for providers the backend reports `enabled: true`. A fetch failure leaves both disabled (the honest default). Clicking an enabled button calls `api.sso.authorize(provider)`, stashes `{provider, signed state}` in `sessionStorage` (survives the full-page redirect; cleared single-use on return), then does a real `window.location.href = authorization_url` redirect. SAML stays unconditionally disabled — the backend has no SAML provider in `SSO_PROVIDERS` (there's a separate, much larger `app/core/saml_sso.py` behind an optional `python3-saml` dependency and its own metadata/ACS endpoints — a genuinely different integration, out of scope here; button stays honestly disabled, no fabrication).
- New `SSOCallbackScreen`: reads `?code&state` (or `?error`) from `window.location.search`, pairs the raw `state` against the stashed signed state (mismatch -> real error, never calls the backend), calls `api.sso.callback(provider, code, signedState)`, and reports the resulting `{access_token, user, is_new_user}` up via `onComplete`. Denied consent (`?error=...`) and a failed exchange both render a real error screen with a way back to sign-in — no redirect loop, no fabricated session.

**`frontend/src/screens/App.jsx`** — one route, nothing else touched: `AppShell` now short-circuits to `<SSOCallbackScreen onComplete={...}/>` when `location.pathname === "/auth/callback"`, placed *after* every hook call in the component (all existing hooks still run unconditionally every render) so navigating away from the callback route via `setRoute("dashboard")` inside the same mounted instance can't violate the Rules of Hooks. `onComplete` normalizes the SSO user payload into the same shape the password-login path uses, then does exactly what a password login does: `storage.auth.set(...)`, `ctx.setAuthed(...)`, toast, `setRoute("dashboard")`.

**`frontend/src/globals.js`** — re-exports `SSOCallbackScreen` alongside the existing `AuthScreen` export from `auth-onboarding.jsx` (needed so `App.jsx` can import it the same way it imports `AuthScreen`).

## 3. api.js added (`api_js_added`)

Added right after `authAPI` (~line 290) and wired into the `api` export object:

```js
export const ssoAPI = {
  providers: () => apiRequest('/sso/providers'),
  authorize: (provider) => apiRequest(`/sso/authorize/${provider}`),
  callback: (provider, code, state) =>
    apiRequest(`/sso/callback/${provider}`, {
      method: 'POST',
      body: JSON.stringify({ code, state, provider }),
      credentials: 'include',
    }),
};
```
Plus `sso: ssoAPI,` added into `export const api = {...}` next to `auth: authAPI,`. Used targeted Edits next to `authAPI`, did not rewrite the file (another agent's concurrent edits to api.js were present and preserved — verified with an esbuild syntax check after).

## 4. Tests (proof)

**Backend** — `backend/app/tests/test_sso.py` (extended existing file), provider HTTP mocked via a fake `httpx.AsyncClient` (`sso_module.httpx.AsyncClient` monkeypatched), provider client_id/secret monkeypatched onto the module's `SSO_PROVIDERS` dict for the "configured" tests:
- `test_unconfigured_provider_stays_disabled` — providers list shows `enabled: False`; `GET /sso/authorize/github` -> 400.
- `test_configured_provider_yields_authorize_redirect` — providers list shows `enabled: True`; `GET /sso/authorize/google` -> 200 with a real Google authorize URL + signed state.
- `test_sso_callback_completes_a_real_session` — full code exchange (mocked provider HTTP) -> 200, real user in body, `access_token` cookie present, and a spy on `set_auth_cookies` proves both access+refresh tokens were handed to the same cookie-setting helper `/auth/login` uses.
- `test_sso_callback_rejects_bad_state` — tampered state -> 401, no session created.
- Pre-existing 3 smoke tests still pass.

Run: `TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_sso_test.db python -m pytest app/tests/test_sso.py -q` -> **7 passed**. Scratch DB deleted after.

**Frontend** — new `frontend/src/root/__tests__/auth-onboarding.sso.test.jsx` (6 tests):
- AuthScreen enables only the backend-reported-configured provider and performs the real `authorize()` -> `window.location.href` redirect, stashing the signed state.
- AuthScreen buttons stay disabled (no fabricated login) when the providers fetch fails.
- SSOCallbackScreen completes the exchange and reports the session up; clears the single-use sessionStorage markers.
- SSOCallbackScreen shows a real error on denied consent (`?error=...`), never calling the backend.
- SSOCallbackScreen refuses a mismatched `state` without ever calling the backend.
- SSOCallbackScreen shows a real error when the exchange call itself fails.

Run: `npx vitest run src/root/__tests__/auth-onboarding.sso.test.jsx` -> **6 passed**. Also reran `src/__tests__/AppShell.test.jsx` (2 passed) and the full `src/__tests__ src/root/__tests__ src/context/__tests__` trees (111 passed) for regressions from the `App.jsx`/`globals.js`/`api.js` edits.

## Skipped / explicitly out of scope
- SAML button: left disabled. Real SAML support (`app/core/saml_sso.py`) is a separate, optional-dependency integration with its own metadata/ACS endpoints, not the OAuth2 flow this job wires up.
- The dropped `refresh_token` Set-Cookie header (pre-existing, shared middleware, reproduces on `/auth/login` too) — flagged above, not fixed (out of file scope for this job).

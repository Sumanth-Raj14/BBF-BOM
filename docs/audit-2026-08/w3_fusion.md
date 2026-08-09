# WS3 — Fusion 360 (Autodesk Platform Services) CAD connector

## Files
- NEW `backend/app/integrations/cad/__init__.py` (empty, package marker — `cad/` didn't exist yet)
- NEW `backend/app/integrations/cad/fusion.py` — `FusionConnector` + OAuth/Model-Derivative helpers
- NEW `backend/app/tests/test_cad_fusion.py` — 13 tests, all passing, mocked HTTP only

## Framework status at write time
`backend/app/integrations/cad/base.py` and `registry.py` **did not exist** in the tree
when this was built (checked first, per instructions). `FusionConnector` is built
against the interface described in the task brief:
`authenticate()` / `verify_connection()`, `list_documents()`,
`get_assembly_structure(document_id)`, `get_part_metadata()`, returning
`{external_id, part_number, name, revision, quantity, children[]}`.

It does **not** subclass anything yet — wiring it into `base.py`'s `CadConnector`
ABC (once it lands) should be a one-line inheritance change plus a registry
entry, e.g.:

```python
# in registry.py (not owned by this task):
from app.integrations.cad.fusion import FusionConnector
registry.register("fusion360", FusionConnector)
```

## What was built
- **3-legged OAuth2 against APS** (`/authentication/v2/authorize`,
  `/authentication/v2/token`): `build_authorize_url()`, `exchange_code()`,
  `refresh_access_token()` — HTTP Basic client auth, matching APS's documented
  confidential-app OAuth v2 flow. Refresh-token rotation is handled (APS may
  return a new refresh_token on refresh; it's persisted).
- **Credential storage**: same shape as the existing Zoho Books integration
  (read `app/integrations/zoho_oauth.py` first, as instructed) — the whole
  `{client_id, client_secret, refresh_token, access_token, access_token_expires_at}`
  blob is ONE Fernet ciphertext via the repo's existing
  `app/integrations/crypto.py` (`encrypt_integration_secret`/`decrypt_integration_secret`,
  the dedicated integration-credential key, same helper Zoho already uses).
  BYO-app-per-tenant, not a global app — a tenant registers their own APS app
  and this connector stores their client_id/secret + tokens per
  `IntegrationConnection`.
- **Data Management API**: `list_hubs()` → `list_projects()` →
  `list_top_folders()` → `list_folder_contents()` → `list_documents()`
  (convenience wrapper, one level of top-folder walking) → `get_part_metadata()`.
- **Assembly structure**: `get_assembly_structure()` — looks up the item's tip
  version, submits/reuses a Model Derivative translation job, polls the
  manifest (bounded attempts, raises rather than fabricating a result if
  translation never finishes or fails), reads the translated object tree +
  properties, and maps occurrences into the normalised tree.
- **Honest failure**: `FusionNotConfiguredError` when no client_id/secret or no
  refresh_token is stored — raised with **zero HTTP calls** (tested by making
  the mock transport assert-fail if invoked).

## Honest limitations (documented in the module docstring, not glossed over)
- Fusion's native BOM feature (aggregated per-component quantities) has no
  broadly-documented, stable public REST endpoint — the "Fusion Data API" that
  exposes it is invite/beta-gated. **Not implemented, not faked.**
- The only broadly-documented way to get assembly structure over REST is the
  Model Derivative translated object tree, which is **occurrence-based, not
  pre-aggregated**: every occurrence becomes its own node with `quantity=1`
  rather than a guessed aggregate count.
- `part_number`/`revision` are populated only when the translated model
  actually carries those named properties (checked against a couple of common
  key spellings: "Part Number"/"PartNumber", "Revision"/"Rev") — `None` when
  absent, never invented.
- Translation is async; the poller has a bounded attempt budget and raises
  `FusionDerivativeNotReadyError`/`FusionDerivativeFailedError` instead of
  returning a partial/fake tree.

## Tests (mocked HTTP, no live calls)
`backend/app/tests/test_cad_fusion.py`, 13 tests, all green:
- authorize-URL construction
- code exchange (Basic auth header + correct grant/body)
- refresh-token grant + rotation
- cached-token fast path (asserts no HTTP call happens)
- **not-configured honest error, twice** (no creds at all; creds but no
  refresh_token) — both assert **zero HTTP calls**
- encrypted auth-blob roundtrip
- hub/project listing mapped to `{external_id, name}`
- `list_documents()` walking top folders → items (filters out sub-folders)
- `verify_connection()` → `/userprofile/v1/users/@me`
- full assembly fetch: item versions → job → manifest(success) → object tree →
  properties → normalised tree, asserting exact parent+child node shape
- translation-never-finishes → `FusionDerivativeNotReadyError`
- translation-failed → `FusionDerivativeFailedError`

Run: from `backend/`,
`TEST_DATABASE_URL="sqlite+aiosqlite:///./scratch_x.db" python -m pytest app/tests/test_cad_fusion.py -q`
(scratch db removed after — these tests don't touch the DB at all, no fixture
used).

## What the user must set up to go live (nothing here is verifiable without it)
1. Create an app at https://aps.autodesk.com (APS "My Apps" / developer portal).
2. Grab its **Client ID** and **Client Secret** (confidential/server-side app —
   required for the Basic-auth token exchange this connector uses).
3. Register a **Callback URL** matching this deployment's OAuth callback route
   exactly (APS validates it byte-for-byte against what's registered).
4. Enable/request access to the **Data Management API** and **Model Derivative
   API** for the app (APS apps are scoped to specific product APIs).
5. Grant, at minimum, the scopes `data:read data:search viewables:read`
   (`DEFAULT_SCOPES` in `fusion.py`) during the consent screen — broaden if a
   future increment needs write access.
6. The tenant's Fusion designs must live in a **hub the consenting user has
   access to** (personal hub or an ACC/BIM 360-backed team hub) — `list_hubs()`
   only returns hubs visible to the token's user.
7. Nothing above can be verified without real APS credentials — this build
   proves the request/response shapes against Autodesk's documented API
   contracts using mocked HTTP, not against a live tenant.

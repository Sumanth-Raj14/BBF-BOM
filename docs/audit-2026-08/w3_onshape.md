# CAD connector framework + Onshape connector

## What was built

**Framework** (`app/integrations/cad/`):
- `base.py` — abstract `CadConnector` (verify_connection / list_documents /
  get_assembly_structure / get_part_metadata) + the normalised schema every
  vendor maps into: `CadDocumentRef`, `CadPartMetadata`, `CadNode` (recursive
  tree, `id` is connector-opaque), `CadAssembly`. Error hierarchy:
  `CadConnectorError` → `CadAuthError` / `CadRateLimitError` (carries
  `retry_after`) / `CadNotFoundError`.
- `registry.py` — `@register` class decorator, `get_connector_class`,
  `list_connector_types`, `build_connector`. Fusion 360/Altium add themselves
  here with zero changes to the routes or the importer.
- `app/models/cad_connection.py` + `alembic/versions/056_cad_connections.py`
  — per-tenant, per-vendor connection row. `credentials` is a Fernet-
  encrypted JSON blob using the EXACT before_insert/before_update/load event
  pattern `ERPConnector.apiKey` already uses (app/core/encryption.py,
  fernet_encrypt/fernet_decrypt) — no new crypto mechanism. `connector_type`
  has no CHECK constraint on purpose: new vendors register without a
  migration.
- `app/api/endpoints/cad_connectors.py` — generic routes: `GET /types`,
  CRUD on connections, `POST /{id}/test` (real `verify_connection` call,
  honest ok/reason/detail — mirrors the existing `/integrations/{provider}/
  test-connection` pattern, never fabricates success), `GET /{id}/documents`,
  `POST /{id}/import` (walks the normalised tree and calls
  `part_service.create_part` / `bom_service.create_bom` /
  `bom_service.create_bom_item` — no BOM-writing logic duplicated here).

**Onshape connector** (`app/integrations/cad/onshape.py`):
- Auth: API access key + secret key, HTTP Basic
  (`Authorization: Basic base64(access_key:secret_key)`) — the documented,
  simpler of Onshape's two key-based schemes
  (https://onshape-public.github.io/docs/auth/apikeys/). Onshape's other
  documented option, HMAC request signing, is NOT implemented — noted below.
- `list_documents`: `GET /documents`, follows the `next` pagination link
  (capped at 50 pages — a runaway-cursor guard, not a real limit).
- `get_assembly_structure`: resolves the document's default workspace, finds
  its `ASSEMBLY` element, then calls the documented `getAssemblyDefinition`
  endpoint (`GET /assemblies/d/{did}/w/{wid}/e/{eid}`) and builds the
  normalised tree from `rootAssembly.instances` / `subAssemblies` / `parts`.
  Repeated occurrences of the same part collapse into one `CadNode` with
  `quantity = occurrence count` (Onshape lists each occurrence separately,
  it doesn't return a pre-aggregated quantity).
- `get_part_metadata`: documented metadata endpoint
  (`GET /metadata/d/{did}/w/{wid}/e/{eid}/p/{pid}`), parses the `properties`
  array into `CadPartMetadata` (part number/description/material/revision +
  everything else into `custom_properties`).
- 401/403 → `CadAuthError`, 429 → `CadRateLimitError` with `retry_after`
  parsed from the header, 404 → `CadNotFoundError`, other 4xx/5xx →
  `CadConnectorError`. No proactive rate-limiter (unlike the Zoho client) —
  Onshape publishes no fixed rate, so this just surfaces a 429 honestly
  rather than guessing a throttle schedule.

## A documented endpoint deliberately NOT used

Onshape also exposes a dedicated `/assemblies/.../bom` endpoint. Its exact
response shape (custom BOM-table headers/columns are per-document-template)
could not be confirmed against Onshape's public docs from here. Rather than
guess at that shape and risk silently misreading a real BOM, this connector
builds the tree from `getAssemblyDefinition`, whose structure IS documented.
A true BOM-table pull is a reasonable follow-up once it can be checked
against a real Onshape workspace.

## Honesty notes / what's unverified without live credentials

- No Onshape credentials exist in this environment. Every connector method
  is exercised only against **mocked HTTP** (`httpx.MockTransport`), never a
  real call — see `app/tests/test_cad_onshape_connector.py`.
- The exact JSON field names above come from Onshape's published API docs
  (onshape-public.github.io) plus the `getAssemblyDefinition`/metadata shapes
  as documented there; they were NOT round-tripped against a live workspace.
  If a real Onshape tenant's assembly has quirks not reflected in the public
  docs (e.g. non-standard property names for part number/material), the
  metadata mapping in `get_part_metadata` may need small adjustment.
- HMAC request signing (Onshape's higher-security auth option) is not
  implemented — only Basic auth. Fine for a server-side integration; would
  need adding if Onshape ever deprecates Basic auth for API keys.

## What the user must supply to verify against the real service

- An Onshape **access key + secret key** (Developer Portal → API Keys).
- A **document id** to test `get_assembly_structure` / `import` against
  (and that document must contain at least one Assembly tab/element —
  Part-Studio-only documents will 404 with "no assembly element found").
- Nothing else is required (no workspace/tenant id beyond the key pair,
  no redirect URL — this is key-based auth, not OAuth).
- Until then, `POST /cad-connectors/{id}/test` is the fastest way to confirm
  real credentials work — it makes exactly one authenticated `GET /documents`
  call and reports `ok`/`auth_failed`/`error` honestly.

## Tests (all passing, mocked HTTP / real DB — see below for exact commands)

- `app/tests/test_cad_onshape_connector.py` (7 tests): verify_connection
  success/auth-failure/missing-credentials, list_documents pagination,
  429→CadRateLimitError with retry_after, get_assembly_structure mapping
  (occurrence grouping + nested sub-assembly + suppressed-instance drop),
  get_part_metadata property parsing.
- `app/tests/test_cad_connectors_api.py` (7 tests): unknown connector_type
  rejected, `/types` lists "onshape", credentials never returned by the API,
  **credentials are Fernet-encrypted at rest** (raw SQL read of the
  `cad_connections.credentials` column — not the ORM-decrypted value —
  asserts the plaintext secret is absent and the value carries the Fernet
  ciphertext marker), `/test` reports auth failure and success honestly
  (`ok`/`reason`/`detail`, connection status persisted), and a full
  `/import` round-trip mapping a nested normalised tree into real
  Part + BOMItem rows with correct parent linkage and quantities.

Run (from `backend/`, scratch DB, deleted after):
```
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_cadwave.db python -m pytest app/tests/test_cad_onshape_connector.py app/tests/test_cad_connectors_api.py -q
```
14 passed. Also re-ran `test_erp_connectors.py`, `test_erp_honesty.py`,
`test_bom_enterprise.py`, `test_zoho_books_2a.py` (24 passed) to check the
`app/models/__init__.py` / `app/api/endpoints/__init__.py` additions didn't
regress anything, and a full-suite collection (`--collect-only`) confirms all
827 existing tests still collect cleanly.

## Files touched

New:
- `backend/app/integrations/cad/__init__.py`, `base.py`, `registry.py`, `onshape.py`
- `backend/app/models/cad_connection.py`
- `backend/app/api/endpoints/cad_connectors.py`
- `backend/alembic/versions/056_cad_connections.py`
- `backend/app/tests/test_cad_onshape_connector.py`, `test_cad_connectors_api.py`

Edited (both outside the forbidden list, both one-line-ish additions):
- `backend/app/models/__init__.py` — added `from app.models.cad_connection import CadConnection` (needed so `Base.metadata` includes the table for the test suite's `create_all`).
- `backend/app/api/endpoints/__init__.py` — added `cad_connectors` to the module import list (needed so `endpoints.cad_connectors.router` resolves for whoever adds the api_v1.py line).

**Not touched:** `app/api/api_v1.py` (router line reported separately below),
none of the other forbidden models/services/endpoints/frontend files.

## Router line for the controller to apply to `app/api/api_v1.py`

```python
api_router.include_router(
    endpoints.cad_connectors.router, prefix="/cad-connectors", tags=["cad-connectors"]
)
```

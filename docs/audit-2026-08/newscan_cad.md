# CAD area audit — findings

Files read in full:
- backend/app/integrations/cad/base.py
- backend/app/integrations/cad/registry.py
- backend/app/integrations/cad/adapters.py
- backend/app/integrations/cad/onshape.py
- backend/app/integrations/cad/fusion.py
- backend/app/integrations/cad/altium.py
- backend/app/api/endpoints/cad_connectors.py
- backend/app/models/cad_connection.py
- backend/app/integrations/cad/__init__.py (registration wiring, sanity check)
- backend/app/tests/test_cad_fusion.py (spot check to confirm finding #2 is untested end-to-end)

## Finding 1 — HIGH — silent quantity=0 -> quantity=1 coalescing (DNP components silently imported as populated)

File: backend/app/integrations/cad/adapters.py, line 101 (`_to_node`):
```python
quantity=float(d.get("quantity") or 1),
```
`or 1` treats an explicit `0` the same as "missing" and substitutes `1`. Altium
BOM exports commonly carry `Quantity=0` for Do-Not-Populate (DNP) components —
`altium.py::_group_rows` correctly preserves this (`qty_raw if qty_raw is not
None else ...`, so a real `0` stays `0` all the way through grouping). But
every consumer of that grouped dict goes through `adapters._to_node` before
being written to a BOM:
- `backend/app/api/endpoints/cad_connectors.py:376` (`import_altium_file`,
  the file-upload path — "the ONLY CAD import that needs no vendor
  credentials", i.e. the primary/most-used Altium ingestion path) calls
  `_to_node(document)` directly.
- `AltiumCadConnector.get_assembly_structure` (adapters.py) also routes the
  cloud path through the same `_to_node`.

Effect: a component explicitly marked qty 0 (DNP) in the vendor file is
silently written as `BOMItem.quantity = 1` — a real component with no
warning, contradicting the source file. Worse, the `dry_run=true` preview
branch of `import_altium_file` (line ~405: `"components": document["children"]`)
returns the *pre-`_to_node`* dict, where quantity is still the correct `0` —
so the dry-run preview and the actual (non-dry-run) import silently disagree
for any DNP line, and nothing in the response says so.

Fix: `d.get("quantity")` should only fall back to `1` when it is `None`
(e.g. `q = d.get("quantity"); quantity=float(q) if q is not None else 1.0`),
not whenever it is falsy.

## Finding 2 — HIGH — rotated/refreshed OAuth tokens are never persisted back to the stored CadConnection, so refresh-token rotation permanently breaks the integration

Files:
- backend/app/integrations/cad/fusion.py:301-304 (`FusionConnector.authenticate`)
  mutates `self._access_token` / `self._refresh_token` in memory and the
  module comment explicitly flags: "APS may rotate the refresh token on
  refresh — persist the new one."
- backend/app/integrations/cad/altium.py:479-483 (`AltiumCloudConnector.authenticate`)
  does the same, same rotation risk.
- backend/app/integrations/cad/adapters.py: `FusionCadConnector.__init__`
  (line 143) builds `self._vendor = FusionConnector(auth_blob=self.credentials)`
  and `AltiumCadConnector._client()` (line 217-232) builds
  `AltiumCloudConnector(...)` from the decrypted credential dict — neither
  adapter ever reads back `self._vendor.auth_blob()` / the client's rotated
  token after a call.
- backend/app/api/endpoints/cad_connectors.py: every route that builds a live
  connector (`_build()`, used by `test_connection`, `list_documents`,
  `import_assembly`) discards the connector object after use. None of them
  call anything like `conn.credentials = json.dumps(new_blob)` the way the
  existing Zoho integration does (`app/api/endpoints/zoho_books.py:128,212`,
  `conn.auth = dump_auth_blob(blob)`, which this task's own connectors were
  told to mirror per fusion.py's docstring: "same shape as the existing Zoho
  Books integration ... read first, this module mirrors its structure
  closely").

Effect: every Fusion/Altium API call re-exchanges the refresh token from
scratch (the in-memory access-token cache never survives past one request
because a fresh connector is built per request) — wasteful but not wrong by
itself. The real defect: if the vendor rotates the refresh token on that
exchange (both vendor comments say this happens), the newly-issued
refresh_token is held only on the throwaway in-memory object and is lost the
instant the request finishes. The *old*, now-invalidated refresh_token
remains the only one in `CadConnection.credentials`. The very next call's
refresh attempt is rejected by the vendor (`invalid_grant`), and the
connection is permanently broken until a human re-enters credentials — even
though the tenant did nothing wrong. `test_cad_fusion.py` only asserts
`connector.auth_blob()["refresh_token"] == "rotated-rt"` on the bare
`FusionConnector`, in isolation — there is no test exercising the
persistence gap at the `cad_connectors.py` / `CadConnection` layer, because
that layer never persists it at all.

Fix: after `verify_connection`/`list_documents`/`get_assembly_structure`
succeeds (or in a small wrapper `_build()` uses), read the vendor object's
current `auth_blob()` and, if it differs from what was loaded, write it back
via `conn.credentials = json.dumps(...)` + `db.commit()`, same pattern as
`zoho_books.py`.

## Reviewed, no defect found
- Tenant isolation: `_get_connection_or_404`, `list_connections`,
  `create_connection`, `_find_or_create_part` (Part.tenantId scoped) — all
  correctly scoped by `tenantId`. No raw SQL, no cross-tenant leak.
- Credentials never returned in `_public()` / never logged in any error
  string built in these files (httpx exception text doesn't include the
  Authorization header; Onshape/APS/Altium error paths only echo response
  bodies, not request headers).
- `CadConnection` Fernet encrypt/decrypt round-trip (before_insert/
  before_update/load) mirrors `ERPConnector` correctly; re-encrypts on any
  commit because the `load` listener decrypts in place.
- Altium designator grouping (`altium.py::_group_rows`): same-MPN rows
  correctly sum quantity and union designators in encounter order (R1/R2/R5
  -> one node, qty 3, designators preserved) — this part is correct.
- Onshape assembly-tree quantity aggregation (`onshape.py::_build_children`):
  suppressed instances excluded, identical occurrences correctly grouped and
  counted — correct.
- BOM parent/child linkage (`cad_connectors.py::_import_node`): recursion
  correctly threads `parent_item_id` from the just-created item id to each
  child; matches expected hierarchy.
- `AltiumFileConnector` extension allow-list (.csv/.xlsx only) rejects
  anything else as `AltiumParseError` -> 400, no garbage rows from unsupported
  files.

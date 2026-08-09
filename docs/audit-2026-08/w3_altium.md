# Altium connector -- writeup

## Files
- NEW `backend/app/integrations/cad/altium.py`
- NEW `backend/app/tests/test_cad_altium.py`
- Did NOT touch `base.py`, `registry.py`, `cad_connectors.py`, or any file in the
  DO-NOT-TOUCH list. `backend/app/integrations/cad/base.py` did not exist at
  any point while this was written (checked repeatedly); a sibling
  `fusion.py` landed mid-task from a parallel wave, also not depending on
  base.py, also noting its absence -- confirms base.py genuinely isn't built
  yet, not a race on my end.

## What was built

### File path (no credentials needed) -- fully proven
- `parse_altium_bom_csv(content, source_name=...)` / `parse_altium_bom_xlsx(...)`:
  parse a standard Altium BOM export into `{external_id, part_number, name,
  revision, quantity, children[]}`. Root = the file; children = one node per
  distinct component.
- Column mapping is tolerant: Designator/RefDes/Ref, Comment/Value,
  Footprint/Pattern/Package, Description/Desc, Quantity/Qty, Manufacturer/Mfr,
  Manufacturer Part Number/MPN/Mfr Part No, Supplier/Vendor/Distributor,
  Supplier Part Number/Vendor Part No/SPN -- matched via a normalise-then-alias
  lookup (strip everything but lowercase letters/digits, compare against an
  alias set), so "Mfr. Part #", "MFR PART NO", "mfrpartnumber" all resolve.
- **Designator grouping (the point of the connector)**: rows are grouped by
  manufacturer part number (case/whitespace-insensitive); quantities sum
  across rows; the designator list is the union in encounter order. R1/R2/R5
  on three separate rows -> one node, `quantity=3`,
  `designators=["R1","R2","R5"]`. Also handles the other common export shape:
  one row with `Designator="R10, R11, R12"` and an explicit `Quantity=3`.
  Rows with no MPN fall back to grouping by (comment, footprint, description)
  -- flagged as a heuristic with a `# ponytail:` comment (two genuinely
  distinct unlabeled parts sharing those three fields would incorrectly
  merge; not built past that because real Altium exports almost always carry
  an MPN for anything that isn't a generic passive).
- `AltiumFileConnector(content, filename)`: wraps the parser behind the
  expected connector method names (`authenticate`/`verify_connection`
  trivially `True` -- no credential involved; `list_documents`,
  `get_assembly_structure`, `get_part_metadata`).
- Malformed-file handling: empty file, undecodable bytes, non-XLSX bytes
  passed to the XLSX parser, and a file with no recognizable
  Designator/Comment/MPN column all raise `AltiumParseError` -- never a
  partial/fake BOM.

### Cloud path (Altium 365 Workspace API)
Researched against the public Altium Developer Center docs (WebSearch/
WebFetch; no live workspace available here). Confidently implemented:
- It's a **GraphQL** API (not classic REST/OAuth2 as I initially assumed from
  the task description) -- `https://{workspace_domain}/api/graphql`,
  `Authorization: Bearer {access_token}`.
- Refresh-token exchange: `POST https://auth.altium.com/connect/token`,
  form-urlencoded `grant_type=refresh_token` + `refresh_token` +
  `client_id`/`client_secret` -- a standard OAuth2 refresh grant
  (IdentityServer/Duende-style `connect/token`, confirmed from docs).
- `list_documents()` uses the documented `desProjects(first, after)` example
  query from the Quick Start Guide.
- `verify_connection()` runs that same trivial query as a read-only
  credential check.
- `authenticate()` never fabricates a token: no access_token AND no
  refresh_token+client_id+client_secret raises `AltiumAuthError` (tested).

**NOT confidently implemented -- said so instead of guessing:** the exact
GraphQL field names for a project's BOM/component tree are not published in
the docs I could reach (they describe that "BOMs, components, symbols,
footprints" are queryable, but never show the literal schema for it, and one
support-article fragment only got as far as "bom items and their component
details" without field names). `get_assembly_structure()` ships a best-effort
default query (`_DEFAULT_BOM_QUERY`, inferred field-name shape) and is
constructor-overridable via `bom_query=` once someone validates the real
schema against a workspace's Voyager/Nitro browser (Admin -> Developer). The
mocked tests for this path prove the client's *plumbing* (auth header, error
handling, grouping/rollup of whatever the response contains) -- they do not
and cannot prove the guessed field names are what Altium's servers actually
return. This is exactly the situation the task said to flag rather than fake.

Both cloud and file paths funnel component rows through the SAME
`_group_rows()` designator-grouping function, so the designator/quantity
logic is proven once and shared, not duplicated per path.

## Registry entry (not applied -- `registry.py` is out of scope)
Suggested, for whoever wires the registry once `base.py` lands:
```python
registry.register("altium_file", AltiumFileConnector)   # no credentials
registry.register("altium_cloud", AltiumCloudConnector)  # Altium 365 API
```
`AltiumCloudConnector`/`AltiumFileConnector` do not subclass anything (no
base to subclass yet) but implement the exact method names described in the
task: `authenticate()`, `verify_connection()`, `list_documents()`,
`get_assembly_structure(document_id)`, `get_part_metadata(...)`.

## Credential storage (endpoint layer, out of scope, noted for whoever builds it)
This module never persists credentials itself. When someone wires up
persistence: this tree's actual convention for a whole-blob credential (not a
single DB column) is `app.integrations.crypto.encrypt_integration_secret` /
`decrypt_integration_secret` (Fernet, keyed off `INTEGRATION_ENCRYPTION_KEY`
falling back to `SECRET_KEY`) -- the same helper
`app.integrations.zoho_oauth.load_auth_blob` uses for the Zoho connection.
`app.core.encryption`'s pgcrypto helpers are column/DB-session-oriented and
don't fit a JSON credential blob with no single column; I did not use them.
`AltiumCloudConnector.from_credentials(blob)` expects an ALREADY-DECRYPTED
dict (`workspace_domain`, `access_token`, `access_token_expires_at`,
`refresh_token`, `client_id`, `client_secret`) -- decrypt with
`decrypt_integration_secret` + `json.loads` before calling it, mirroring
`ZohoBooksClient.from_connection`.

## Tests
`backend/app/tests/test_cad_altium.py`, 19 tests, all passing (SQLite, no DB
needed at all for this file -- pure parsing/HTTP-mock unit tests):
- CSV: designator grouping/quantity rollup (multi-row and combined-designator
  single-row shapes), tolerant header variants, no-MPN fallback grouping.
- XLSX: same grouping proven via openpyxl round-trip.
- Malformed files: empty CSV, unrecognized columns, undecodable bytes, empty
  XLSX sheet, non-XLSX bytes -> all raise `AltiumParseError` honestly.
- `AltiumFileConnector`: full interface walk (authenticate ->
  verify_connection -> list_documents -> get_assembly_structure ->
  get_part_metadata, plus a not-found case) + rejects unsupported extensions.
- Cloud (mocked HTTP via `httpx.MockTransport`, matching the existing
  `test_integration_clients.py` pattern -- no respx in requirements.txt):
  missing-credentials honest failure, refresh-token exchange (URL/body
  asserted), bad-refresh-token failure, `desProjects` query + Bearer header
  assertion, BOM grouping from mocked GraphQL items, top-level GraphQL
  `errors` array raising, part-not-found raising.

Run: `cd backend && python -m pytest app/tests/test_cad_altium.py -q`
(ran via `rtk proxy` in this session because the `rtk` filter reported "No
tests collected" for this file for reasons I didn't chase down further --
`rtk proxy` bypasses the filter and shows the real pytest output: 19 passed).

## Live verification -- what you'd need to prove the cloud path for real
- An **Altium 365 Workspace** with API access enabled, and its workspace
  domain (e.g. `acme.365.altium.com`).
- A token from that workspace's **Admin -> Developer** page: either a
  long-lived access token (works directly, no refresh needed), or a
  `client_id` + `client_secret` + `refresh_token` triple (for the
  `connect/token` refresh exchange this connector implements).
- Unverifiable without a live workspace: the exact BOM/component GraphQL
  schema (`get_assembly_structure`'s field names) -- the default query is a
  best-effort guess, not a confirmed contract. Recommend running it once
  against a real workspace's Voyager schema browser and adjusting
  `_DEFAULT_BOM_QUERY` (or passing `bom_query=` per-connection) before
  depending on this path for a real customer.
- The file path (CSV/XLSX import) needs **no credentials at all** and is
  fully proven by the tests above -- ship this one first.

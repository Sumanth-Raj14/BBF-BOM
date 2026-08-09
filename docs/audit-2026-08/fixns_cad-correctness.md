# AREA: cad-correctness — fix writeup

Source finding doc: `newscan_cad.md` (read first, both findings confirmed as described).

## Finding 1 (HIGH) — quantity 0 silently became 1

**File:** `backend/app/integrations/cad/adapters.py`, `_to_node()`.

Before:
```python
quantity=float(d.get("quantity") or 1),
```
After:
```python
quantity = d.get("quantity")
...
quantity=float(quantity) if quantity is not None else 1.0,
```
Only a genuinely missing (`None`) quantity defaults to 1 now; an explicit `0`
(Altium DNP — Do Not Populate) survives all the way into the created BOMItem.

Audited every other `X or DEFAULT` in adapters.py/altium.py/fusion.py for the
same class of bug (per the task's "check the whole file" instruction):
none found — `_group_rows` in altium.py already handled 0 correctly
(`qty_raw if qty_raw is not None else ...`), and the other `or` fallbacks in
these files are on string fields (`name`, `external_id`) where empty-string
and "missing" are already the same falsy case, so no corruption risk there.

## Finding 2 (HIGH) — rotated OAuth refresh tokens never persisted

**Files:** `backend/app/integrations/cad/base.py`, `adapters.py`, `altium.py`,
`backend/app/api/endpoints/cad_connectors.py`.

- `CadConnector.current_credentials()` added to `base.py` — default returns
  `self.credentials` unchanged (most connectors, e.g. Onshape, never rotate
  anything).
- `FusionCadConnector.current_credentials()` overrides it to return
  `self._vendor.auth_blob()` (already existed on `FusionConnector`).
- `AltiumCloudConnector.auth_blob()` added (mirrors Fusion's, didn't exist
  before) and `AltiumCadConnector.current_credentials()` overrides to return
  `self._cached.auth_blob()` once the lazy client has been built, else the
  original `self.credentials`.
- `cad_connectors.py` gained `_sync_rotated_credentials(db, conn, connector)`:
  reads `connector.current_credentials()`, and if it differs from
  `connector.credentials` (the snapshot taken at construction), re-encrypts
  and persists it via `conn.credentials = json.dumps(current); await
  db.commit()` — same storage mechanism `zoho_books.py` uses
  (`conn.auth = dump_auth_blob(...)`), just triggered per-call instead of at
  an explicit oauth-callback step, since Fusion/Altium have no such step —
  rotation happens transparently inside routine `authenticate()` calls.
- Wired into the three routes that build a live connector and call it
  (`test_connection`, `list_documents`, `import_assembly`) via
  `try/finally`, so a rotated token is captured even if a *later* step in the
  same call fails for an unrelated reason.
- Uses `getattr(connector, "current_credentials", None)` so it's a no-op for
  anything that doesn't define the hook (e.g. the `FakeConnector` test double
  in `test_cad_connectors_api.py`, which isn't a `CadConnector` subclass and
  which this wave does not touch).

## Tests (`backend/app/tests/test_cad_fixes.py`, new file)

Both proven to fail against the pre-fix code (verified by reverting each fix
in place, re-running, observing the failure, then restoring the fix):

1. `test_to_node_preserves_explicit_zero_quantity` /
   `test_dry_run_and_commit_agree_on_dnp_quantity_zero` — CSV with one normal
   row (qty 1) and one DNP row (qty 0), uploaded via
   `POST /api/v1/cad-connectors/altium/import-file` twice: once `dry_run`
   (always showed 0, pre- and post-fix) and once committed. Asserts the real
   `BOMItem.quantity` for the DNP part is `0` (pre-fix: asserted `1.0 == 0`,
   failed) and the normal part stays `1`.
2. `test_fusion_rotated_refresh_token_is_persisted_to_connection` — creates a
   real `fusion` `CadConnection` via the API, monkeypatches `httpx.AsyncClient`
   globally to a `MockTransport`-backed fake so `FusionConnector`'s
   internally-created client hits a fake APS token endpoint that returns a
   *new* `refresh_token`, calls `POST .../test`, then reads the connection's
   `credentials` column back with raw SQL + `fernet_decrypt` (bypassing the
   ORM identity map, which would otherwise just hand back the same in-memory
   object this request already mutated) and asserts the rotated token is
   there (pre-fix: asserted `'old-rt' == 'rotated-rt'`, failed).
3. `test_fusion_no_rotation_means_no_spurious_write` — companion test proving
   the sync is conditional: when the vendor response carries no
   `refresh_token`, the stored value is untouched.
4. `test_to_node_still_defaults_missing_quantity_to_one` /
   `test_to_node_preserves_empty_string_part_number` — guardrails so the fix
   didn't overcorrect (missing quantity still defaults; unrelated string
   fields untouched).

## Verification run

```
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_*.db python -m pytest \
  app/tests/test_cad.py app/tests/test_cad_fusion.py app/tests/test_cad_altium.py \
  app/tests/test_cad_onshape_connector.py app/tests/test_cad_connectors_api.py \
  app/tests/test_cad_registry.py app/tests/test_cad_altium_upload.py \
  app/tests/test_cad_fixes.py -q
```
75 passed (69 pre-existing + 6 new). All scratch DBs deleted after.

## Scope discipline

Only touched: `backend/app/integrations/cad/{adapters,fusion,altium,base}.py`,
`backend/app/api/endpoints/cad_connectors.py`, and the new
`backend/app/tests/test_cad_fixes.py`. `base.py` was not in the explicit file
list but was the minimal, correct place for the shared
`current_credentials()` default hook (every `CadConnector` subclass, current
and future, gets safe default behavior for free instead of duplicating the
"return self.credentials" fallback in every adapter). Did not touch
`fusion.py`'s logic (its `auth_blob()`/rotation already worked correctly in
isolation — only the read-back was missing) beyond confirming no changes were
needed there. Did not touch any of the files reserved for the other fix wave.
Left `bom_service.py`'s unrelated `item.quantity or 1` (EBOM->MBOM derivation,
not the CAD import path) alone — out of scope for this task.

# CLUSTER: api-key-security

## Finding 1 — plugin-login ignores API-key scopes

**File:** `backend/app/api/endpoints/auth.py`, `plugin_login` (~line 106-155)

**Verified real.** `plugin_login` matches the presented key against `ApiKey`
rows and then calls `auth_service.make_tokens(user)` -> `create_tokens_for_user`
(`backend/app/core/security.py`), which mints a normal bearer JWT with no
scope claim at all. `core/deps.py::get_current_user`'s bearer-token branch
(the one this JWT is validated by on every subsequent request) never reads
or checks scopes — only the `X-API-Key` header branch
(`_authenticate_by_api_key`) enforces the read/write scope guard. So a
`["read"]`-only key could be exchanged here for a JWT that authorizes
writes everywhere, defeating the scope guard entirely.

**Fix chosen:** refuse plugin-login for keys without `"write"` scope
(the "refuse" option from the two offered), because the "stamp scopes onto
the token" option would require `core/deps.py`'s bearer path to read and
enforce a scope claim, and that file is out of scope for this fix / already
finalized. Given the bearer path currently grants unconditional full access,
the only correct fix without touching `deps.py` is to gate *token issuance*
itself: only a full-capability (`"write"`) key may be exchanged for a
full-capability bearer token.

```python
scopes = matched.scopes if isinstance(matched.scopes, list) else []
if "write" not in scopes:
    raise HTTPException(status_code=403, detail="API key does not have sufficient scope for plugin-login (requires 'write')")
```

**Side effect (not fixed, out of file scope):** `backend/app/tests/test_solidworks_bom_ingest.py::test_plugin_login_with_api_key`
creates an `ApiKey` row directly via the ORM without setting `scopes`, so it
gets the model's default `[]` (no scopes at all). That test now correctly
gets a 403 instead of a 200, since a no-scope key legitimately has zero
capability under the (already-fixed) scope model. This file was not in my
allowed edit list (`auth.py`, `api_keys.py`, `test_api_key_security.py`), so
I left it as-is. It needs a one-line fix — add `scopes=["read", "write"]` to
that test's `ApiKey(...)` constructor call — to match the new, intentionally
stricter behavior.

## Finding 2 — every API key shares the literal prefix "bkb"

**File:** `backend/app/api/endpoints/api_keys.py`, `create_api_key` and
`rotate_api_key`

**Verified real.** Both endpoints did `raw_key = f"bkb_{secrets.token_urlsafe(32)}"`
then `key_prefix = raw_key.split("_")[0]`, which is always exactly `"bkb"`.
`core/deps.py::_authenticate_by_api_key` looks a key up by
`.where(ApiKey.key_prefix == key_prefix)` and then `.scalar_one_or_none()`.
The moment a second active key exists (for the same user or any other),
that query returns two rows and `scalar_one_or_none()` raises
`MultipleResultsFound`, which is unhandled -> the request 500s for
everyone using API-key auth, not just the two colliding keys. (This was
already flagged as a known limitation in a comment in
`app/tests/test_api_key_scopes.py`, confirming it's a real, previously-known
gap.)

**Fix:** fold unique random hex into the prefix itself, before the
underscore, so `raw_key.split("_")[0]` (used identically in
`create_api_key`, `rotate_api_key`, and `core/deps.py`'s lookup) still
extracts the *whole* prefix and that whole prefix is now unique per key:

```python
raw_key = f"bkb{secrets.token_hex(6)}_{secrets.token_urlsafe(32)}"
key_prefix = raw_key.split("_")[0]   # e.g. "bkb1a2b3c4d5e6" — unique per key
```

`key_prefix` column is `String(20)`; `"bkb"` (3) + 12 hex chars = 15 chars,
comfortably under the limit. No change needed to `core/deps.py`'s lookup
logic — it already extracts on `"_"`, which still works because the
unique hex has no underscore in it.

## Test: `backend/app/tests/test_api_key_security.py` (new file)

Three tests, all currently passing:

1. `test_read_only_key_cannot_get_token_via_plugin_login` — creates a
   `["read"]`-scoped key, calls `/auth/plugin-login`, asserts 403 with
   "scope" in the detail. **Red-before verified**: with the finding-1 fix
   reverted, this test fails (gets a 200 + full token instead of 403).
2. `test_write_scoped_key_can_still_get_token_via_plugin_login` — sanity
   check that a full-capability key still works (200 + `session_id`).
3. `test_two_active_keys_can_both_authenticate` — creates two keys through
   the real `create_api_key` endpoint, asserts their prefixes differ, then
   authenticates both via `X-API-Key`, asserting both get 200. **Red-before
   verified**: with the finding-2 fix reverted, the prefix-equality
   assertion fails immediately (`'bkb' != 'bkb'`) — confirming the root
   cause; separately (checked manually) the reverted code goes on to raise
   `MultipleResultsFound` on the second key lookup if that assertion is
   removed.

## How verified

- Ran `python -m pytest app/tests/test_api_key_security.py -x -q` against a
  throwaway sqlite DB (`TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_*.db`)
  — 3 passed with both fixes in place.
- Temporarily reverted each fix in turn, re-ran the corresponding test,
  confirmed it fails (red-before) — output captured above — then restored
  the fix and re-ran to confirm green again.
- Ran the new file together with the pre-existing
  `test_api_key_scopes.py` and `test_api_keys.py` — 15 passed, no
  regressions in the adjacent scope-enforcement test suite.
- Diagnostic-only (not part of my allowed edits): ran
  `test_solidworks_bom_ingest.py -k plugin_login` to check for collateral
  impact — found and documented the one pre-existing test above that now
  needs a one-line scope addition (see "Side effect" note under Finding 1).

## Files touched

- `backend/app/api/endpoints/auth.py`
- `backend/app/api/endpoints/api_keys.py`
- `backend/app/tests/test_api_key_security.py` (new)

No git operations performed. No files outside the allowed list were
modified.

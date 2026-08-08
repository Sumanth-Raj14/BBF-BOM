# Cluster: migrations-ci-build

All four findings confirmed real and fixed. No pytest coverage exists for these
(migrations run against a live Postgres/CI system; the csproj is a build file) —
per the cluster's own instructions, verified by careful reading, static syntax
checks (`py_compile`, YAML parse, XML parse), and cross-referencing the real
`docker-compose.yml` / `postgres-ci.yml` / filesystem instead of pytest.

## 1. `backend/alembic/versions/009_backup_and_schema_fixes.py:60`

**Confirmed real.** `ALTER TABLE po_headers ADD CONSTRAINT IF NOT EXISTS ...` —
Postgres has no `IF NOT EXISTS` for `ADD CONSTRAINT` (only for `ADD COLUMN`,
`DROP CONSTRAINT`, etc.). This is a hard syntax error that aborts the
transaction the whole migration runs in, so migration 009 fails outright on
any DB that hasn't already applied it.

**Fix:** replaced the invalid statement with a `DO $$ BEGIN ... EXCEPTION WHEN
duplicate_object THEN NULL; END $$;` block that attempts the plain `ADD
CONSTRAINT` and swallows only the "already exists" case.

Noted in an inline comment: fresh installs use `Base.metadata.create_all()`
(see `postgres-ci.yml`'s header comment referencing `scripts/init_db.py`), so
already-migrated DBs are unaffected by this change — but the statement must be
syntactically valid for any DB that runs `alembic upgrade head` against a
pre-009 state.

Verified: `python -m py_compile` passes; the DO-block syntax is standard
PL/pgSQL (identical pattern already used correctly elsewhere for
`duplicate_object` guards in this codebase's migration style). No live
Postgres available in this sandbox to execute it directly.

## 2. `backend/alembic/versions/033_money_columns_numeric.py`

**Confirmed real.** Every `op.alter_column` call was wrapped in its own
`contextlib.suppress(Exception)`, but all ~30 calls run inside ONE Postgres
transaction (alembic's default). Once any single `ALTER COLUMN` fails,
Postgres marks the transaction aborted; every subsequent statement in that
transaction (including the "successful" ones from Python's point of view,
since the driver doesn't raise until the commit/next real statement) gets
silently discarded, and `contextlib.suppress` hides all of it. Net effect:
migration reports success, changes nothing beyond (at most) the columns before
the first failure.

**Fix:** removed the blanket `contextlib.suppress` and the `contextlib`
import. Added `_alter_column_guarded()`, which wraps each column's
`alter_column` in its own `SAVEPOINT sp_<table>_<col>` / `RELEASE SAVEPOINT`
(success) or `ROLLBACK TO SAVEPOINT` (failure) — so a failure on one column
only undoes that column's statement and leaves the transaction usable for the
rest. Table/column names are all drawn from the fixed `_MONEY_COLUMNS` dict
literal in this file (no external input), so f-string interpolation into the
SAVEPOINT name is safe.

Verified: `python -m py_compile` passes on the edited file.

## 3. `.github/workflows/ci.yml`

All four sub-findings confirmed real by reading `docker-compose.yml` (service
is named `backend`, not `api`; Dockerfiles are `backend/Dockerfile` and
`frontend/Dockerfile`, none at repo root) and `postgres-ci.yml` (the real,
working gate, left untouched) plus `backend/tests/` (5 files, 882 lines) vs
`backend/app/tests/` (116 `test_*.py` files).

- **(a)** `docker compose pull/up/exec api` in both `deploy-staging` and
  `deploy-production` → changed to `backend` (3 occurrences each job, 6 total)
  to match the actual `docker-compose.yml` service name.
- **(b)** `build-and-push` built `context: .` with no Dockerfile at repo root
  → changed to `context: ./backend`, `file: ./backend/Dockerfile` — the image
  this job pushes is exactly the one `deploy-staging`/`deploy-production` pull
  for the `backend` compose service, so pointing it at `backend/Dockerfile` is
  the correct target (frontend has its own Dockerfile/deploy path not wired
  into this pipeline; out of scope to add here).
- **(c)/(d)** `test-backend` ran bare `alembic upgrade head` against an empty
  Postgres service container (documented in `postgres-ci.yml`'s own header
  comment to fail — migrations 004+ assume tables that only formally existed
  via `create_all` until revision 022) and then ran `backend/tests/` (the
  legacy 5-file/882-line suite) instead of `backend/app/tests/` (~140
  files/116 `test_*.py`), making a green result actively misleading even when
  it happened to pass.

  **Deleted** the `test-backend` job rather than patching it in place:
  `postgres-ci.yml`'s `fresh-install-postgres` job already does the correct
  bootstrap (`python -m scripts.init_db`, the documented path) and
  `pytest-postgres` already runs the full `app/tests/` suite against real
  Postgres as a hard gate. Keeping both would mean two copies of the same gate
  that can drift out of sync — one broken-by-construction, one already
  correct and already the documented gate per the task's own framing
  ("postgres-ci.yml is the real, working gate"). Removed `test-backend` from
  `build-and-push`'s and `notify`'s `needs:` lists accordingly, and replaced
  its row in the `notify` step summary with a pointer to `postgres-ci.yml`.

Verified: `python -c "import yaml; yaml.safe_load(open(...))"` parses the
edited file with no errors; all `needs:` references to `test-backend` were
grepped out (none remain).

## 4. `solidworks-plugin/BlackboxBOM.SolidWorks/BlackboxBOM.SolidWorks.csproj:95`

**Confirmed real.** `Resources\BlackboxBOM.ico` does not exist — confirmed via
glob (`solidworks-plugin/BlackboxBOM.SolidWorks/Resources/**` returns no
files; there is no `Resources` directory at all). MSBuild's `EmbeddedResource`
requires the file to exist and fails with MSB3030 otherwise.

**Fix:** removed the `<EmbeddedResource Include="Resources\BlackboxBOM.ico" />`
line and left a comment explaining why (no icon exists; nothing to embed).
Chose removal over a `Condition="Exists(...)"` guard per the task's own
guidance ("Removing is fine — there is no icon") — a conditional would be
dead code for a file that will never appear.

Verified: `python -c "import xml.dom.minidom as m; m.parse(...)"` parses the
edited `.csproj` with no errors.

## Files touched (exactly the allowed list, nothing else)
- `backend/alembic/versions/009_backup_and_schema_fixes.py`
- `backend/alembic/versions/033_money_columns_numeric.py`
- `.github/workflows/ci.yml`
- `solidworks-plugin/BlackboxBOM.SolidWorks/BlackboxBOM.SolidWorks.csproj`

## Not done / explicitly out of scope
- No new migration files created (per instructions, another agent owns those).
- No changes to `postgres-ci.yml` or `solidworks-plugin.yml` (working, not in
  scope).
- No pytest test files added: this cluster has no pytest coverage by design
  (CI YAML, Alembic DDL against a live Postgres, and an MSBuild project file
  aren't exercised by the SQLite-backed pytest suite), and the task's own
  framing for this cluster says to verify by reading / running the tool
  instead. Static verification (`py_compile`, YAML/XML parse, filesystem
  cross-checks against `docker-compose.yml` and `postgres-ci.yml`) was used
  in place of pytest for each finding.

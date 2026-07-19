# Blackbox BOM Release Notes

## [2.1.0] — 2026-07-19

**Regulated compliance, Zoho Books sync, accessibility & mobile polish, desktop packaging with auto-update.**

Blackbox BOM v2.1.0 ships three completed feature branches (feat/regulated, feat/zoho-books, feat/polish) plus WS7 desktop packaging and production database hardening. The platform now includes FDA 21 CFR Part 11 e-signature compliance, real-time Zoho Books integration, WCAG-AA dark mode with colorblind accessibility, and a single-click Windows installer with automatic updates. All features are production-ready and fully integrated with the PostgreSQL multi-tenant architecture.

### Upgrade Instructions

#### Fresh Installation (v2.1.0)

**Windows (Recommended):**
```powershell
# Download and run the installer
.\install.ps1                  # Interactive or non-interactive
# This handles:
# - Single-click Postgres + backend + frontend setup
# - Auto-migration (alembic upgrade head)
# - 155 tables created on first run
# - Ready for first admin registration
```

**Linux/Docker:**
```bash
python -m scripts.init_db      # Idempotent DB bootstrap + schema creation
docker-compose up -d           # Start full stack
```

#### Upgrading from v2.0.0 → v2.1.0

**Existing databases auto-migrate automatically:**

```bash
# Windows
.\install.ps1                  # Re-run installer (safe; applies new migrations)

# Linux/WSL
./scripts/install.sh           # Re-run installer
python -m scripts.init_db      # Manually run if needed

# Your data is untouched; new tables (Zoho sync, compliance, substance tracking) are created
```

**Auto-Update (Windows Only):**
After first install, the app checks for new versions on startup. Updates download → verify SHA-256 → apply silently without data loss or stopping currently-open sessions.

---

## Major Features (v2.1.0)

### FDA 21 CFR Part 11 e-Signature Compliance (feat/regulated)
- **Digital signatures** on ECOs, approvals, and document uploads with qualified e-signature support.
- **Compliance attestation** for regulated industries (medical devices, aerospace, pharmaceuticals).
- **RoHS/REACH substance tracking**: restriction database, part composition declarations, compliance reports, audit trail.
- **Non-repudiation audit trail**: signature verification, regulatory export, full event logging per CFR Part 11 §11.10.

### Two-Way Zoho Books Integration (feat/zoho-books)
- **Part master sync**: part numbers, costs, descriptions bidirectional with Zoho items.
- **Vendor master sync**: new vendors auto-created in Zoho; rate updates synced back to BOM costing.
- **PO automation**: purchase order line items → Zoho bills with net 30/60 terms; tax calculation.
- **Cost landing**: Zoho cost changes → landing cost updates in BOM costing module.
- **Reliability**: async outbox worker handles network failures, retries, and idempotent deduplication.
- **Audit & control**: full Zoho sync log, review queue for manual approval before apply, rollback capability.
- **UI**: dedicated Zoho Books screen (status, last sync, manual trigger, log viewer).

### Accessibility & Mobile Polish (feat/polish)
- **True WCAG-AA dark mode**: not just `prefers-color-scheme` toggle, but persistent user preference with full theme coverage (no white flashes).
- **High-contrast mode (AAA)**: extreme contrast for low-vision users; separate from dark mode toggle.
- **Colorblind accessibility**: deuteranopia (green-red), protanopia (red-green), and tritanopia (blue-yellow) palettes with verified contrast.
- **Mobile barcode scanner**: one-handed landscape support, large touch targets, voice feedback.
- **Advanced tweaks panel**: power-user settings (density, theme, language, debug logging, cache invalidation).
- **Secrets management**: `compose-secrets` for API keys, SFTP credentials (no plaintext in `.env`).
- **Configurable WAL path**: backup write-ahead logs to fast SSD or NAS separately from main data volume.

### WS7 Desktop Packaging & Auto-Update
- **Single-click Windows installer** (Inno Setup): bundles Postgres, backend, frontend, launcher, updater in one `.exe`.
- **Launcher** (`launcher.py`): init/start/stop of bundled cluster, crash-safe recovery, auto-browser launch.
- **Updater** (`updater.py`, 31 tests): local-first version check → SHA-256 verify → silent install with zero downtime.
- **Build pipeline** (`build.py`): one-command build, sign, and package.

### Production Database Hardening
- **Consolidated schema bootstrap** (`scripts/init_db.py`): greenfield init (create_all + stamp) and existing upgrade (upgrade head) unified in one command.
- **Postgres-specific bug fixes**: env.py now handles long revision IDs (VARCHAR 64), reads `.env` as fallback, CheckConstraint camelCase quoting fixed.
- **Orphan table cleanup**: compliance, substance reference, part composition, and compliance evaluation tables now properly modeled (migration 041_compliance).
- **Postgres CI workflow**: dedicated test suite on real Postgres instance (not just SQLite).
- **DB backup improvements** (`db_backup.py`): 30-day retention policy enforced, hourly scheduled snapshots.

---

## [2.0.0] — 2026-07-19

**Enterprise transformation release — production-ready, OpenBOM-competitive, local-first.**

Blackbox BOM v2.0.0 shifts from a prototype to a shipping, self-hosted manufacturing platform. The canonical data model is now PostgreSQL + multi-tenant FastAPI, with a fully overhauled React UI grounded in a production design system. All engineering and compliance workflows (BOM design, ECO, procurement, quality, inventory, CAD integration) are now hardened against data loss and tenant leakage. The entire stack runs locally — no cloud dependency, no internet required after first deploy.

---

## Major Features

### Local-First Deployment (WS6)
- **One-click Windows installer** (`install.bat` / `install.ps1`): downloads Docker, initializes `.env` with secure random keys, and spins up the full stack (PostgreSQL + Redis + FastAPI + React) on the local machine.
- **Docker Compose architecture**: PostgreSQL 15, Redis 7, FastAPI backend, nginx-fronted React SPA, all in four containers on one host.
- **Backup & restore scripts** (`backup-data.ps1`, `restore-data.ps1`): snapshots database, uploads, and RSA keys for disaster recovery and PC migration.
- **Enterprise-grade PostgreSQL dump script** with configurable retention policy; integrated backup scheduler runs on configurable hourly interval.
- **Makefile** and `.sh` equivalents for Linux/WSL users; Windows `.bat` shims for non-PowerShell environments.

See `INSTALL.md` for user-facing quickstart; `DISASTER_RECOVERY_RUNBOOK.md` for enterprise backup procedures.

### Canonical BOM & Hierarchical Explosion (WS5)
- **Instance-line BOM model**: `bom_items_master` table holds tenant- and BOM-scoped structure with multi-level nesting, effective quantities, and full CRUD via `bomItemsAPI` endpoint.
- **BOM closure table** for fast adjacency queries and where-used analysis across any depth; supports multi-level explosion with effective quantity rollups.
- **Honest failure semantics**: all writes surface actual success/failure (no silent masking); stale UI state impossible.

### PostgreSQL + Multi-Tenant Architecture
- **Single Alembic head** at migration `040_postgres_rls_tenant_isolation` (40 total migrations); all tables tenant-scoped via `tenantId` column.
- **App-layer isolation** (primary): every SELECT, UPDATE, DELETE is auto-filtered by tenant in business logic layer (`app/core/tenant_events.py`); all INSERTs auto-populate `tenantId`.
- **Row-Level Security (RLS)** (defense-in-depth, opt-in): Postgres policies further guard cross-tenant leakage; default `ENABLE_RLS=False` (app-layer isolation sufficient for typical deployments).
- **Business key uniqueness**: part numbers, BOM numbers, PO numbers, serials, ECO numbers are composite `(tenantId, key)` unique, preventing cross-tenant collisions.

### Design System & UI Overhaul (18 screens + 18 modals + 10 advanced)
- **CSS token system**: two-tone accent (olive #B5BC38 / orange #E85D1F), semantic surface/text/border/status tokens, three-step density (`[data-density]`), Geist type scale.
- **Component library**: self-hosted Geist 2.0, React primitives in `src/components/ui/`, dark/light theme aware via `prefers-color-scheme`, accessible defaults.
- **Shim architecture**: `src/root/*.jsx` files register components on `window.*`; true owners in `src/components/**` wired via `LazyScreens.jsx`, enabling progressive refactoring.
- **18 main screens**: Dashboard, Parts, Projects, Vendors, Procurement, Documents, Users, Tenants, Teams, Work Queue, Inventory, Quality, Analytics, BOM Editor, ECO Workspace, Work Orders, Approvals, Advanced Search.
- **18 modals & drawers**: BOM duplication, CAD import, internet scrape, auto-scrape, bulk import, AI assistant, onboarding checklist, price alerts, quote history, rollback, tenant admin, and more.
- **10 advanced screens**: Service BOM, BOM merge, routing/process plans, resource scheduling, compliance dashboards, supplier scorecards, CAPA, FAI, deviations, traceability.
- **Accessibility**: keyboard navigation, ARIA labels, WCAG-AA contrast tested across themes.

### Authentication & Authorization (RS256 JWT + RBAC)
- **RS256 signed JWTs**: secure token issuance and verification; private key stored in Docker volume.
- **Role-based access control**: tenant-scoped roles and permissions; fine-grained per-resource guards (part visibility, ECO approval, inventory adjustment, etc.).
- **Secure self-registration**: users cannot join an existing tenant — only bootstrap an admin account on first deploy.
- **Session management**: secure HTTP-only cookies, session timeout enforcement, session revocation on admin action.

### Data Type Corrections & Compliance
- **Money columns** (`FLOAT` → `Numeric(18,4)`): ensures accurate financial calculations across multi-currency pricing, cost rollups, and supplier costs.
- **BOM quantities** (`Integer` → `Numeric(10,4)`): supports fractional units (resistor networks, cable lengths, etc.) essential in electronics manufacturing.

### Removed: Legacy localStorage & Global PurchaseOrder
- **Eradicated localStorage reliance** for primary engineering data: `bom-editor.jsx`, `parts-screen.jsx` now defer to `AppCtx.jsx` + FastAPI persistent storage.
- **Removed legacy `PurchaseOrder` model**: canonical model is now `POHeader` + `POLineItem` with tenant-scoped uniqueness and RLS.
- **Cleaned `storage.js`**: removed `.bomRows`, `.workOrders`, `.comments`, `.poDrafts` references; old `.set()`/`.remove()` calls purged from editors.

### Fixed Issues
- **BOM explosion scoped by `bom_id` + tenant**: cross-tenant data leak plugged; global-tree bug fixed.
- **BOM editor crashes**: two crash scenarios (stale ref, invalid state) hardened.
- **ECO state-machine guards**: self-approval blocked; illegal transitions (e.g., implement before approval) rejected on action; work-order status `CHECK` reconciled with `on_hold`/`scrapped`.

---

## Breaking Changes

### Database Schema
- **Alembic migration 036 and beyond require VARCHAR(32) widening on `alembic_version.version_num`**: some revision IDs (e.g., `036_role_permission_tenant_scoped`) are 33 characters. SQLite ignores VARCHAR length; fresh Postgres installs fail at migration 036 without widening. Automated in `install.ps1` / `docker-compose.yml` via init script; manual deployments must apply `ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)` before running Alembic.
- **`ENABLE_RLS` env var**: defaults to `False` (app-layer isolation). Set `ENABLE_RLS=true` only on multi-tenant SaaS deployments or air-gapped enterprise installs with heightened isolation requirements (adds ~5–10% query overhead; fully functional with `False`).

### Frontend & Storage
- **No `window.bomRows`, `window.workOrders`, `window.comments`, `window.poDrafts`**: all data lives in PostgreSQL via the API. In-memory React state in `AppCtx.jsx` is the source of truth for UI.
- **All money and quantity inputs now `Numeric`**: frontend must handle fractional values (e.g., 1.5 kg, 0.25 units); APIs reject integer-only input.

### API Contract
- **All `/bom-items` endpoints require `bomId` + `tenantId`**: global tree traversal is gone. `GET /bom-items?bomId={id}` returns only items in that BOM, optionally filtered by depth or parent node.
- **Tenant scoping is mandatory**: every endpoint is gated by `Authorization: Bearer <JWT>` and implicitly scoped to the user's tenant. Cross-tenant requests return 403.

---

## Migration Guide

### Fresh Postgres Installation

1. **Ensure Docker and PowerShell (Windows) or Bash (Linux) are installed.**
   - Windows: Docker Desktop via https://www.docker.com/products/docker-desktop/
   - Linux/WSL: `docker` + `docker-compose` packages

2. **Clone or extract the repo and enter the project root.**

3. **Copy `.env.example` to `.env` and fill in required secrets:**
   ```bash
   # Windows
   copy .env.example .env

   # Linux/WSL
   cp .env.example .env
   ```
   Edit `.env` to set:
   - `POSTGRES_PASSWORD` (generate a strong random value)
   - `REDIS_PASSWORD` (generate a strong random value)
   - `SECRET_KEY` (generate via `python -c "import secrets; print(secrets.token_urlsafe(32))"`)
   - `ALGORITHM` (default `HS256`)
   - All other fields per comments in `.env.example`

4. **Run the installer (this handles all migrations automatically):**
   ```bash
   # Windows (interactive batch file)
   install.bat

   # Windows (PowerShell, non-interactive)
   .\install.ps1

   # Linux/WSL
   ./scripts/install.sh
   ```
   The installer will:
   - Check Docker is installed and running
   - Build images (`backend`, `frontend`) and pull base images (`postgres:15-alpine`, `redis:7-alpine`)
   - Create named volumes for data persistence
   - Run `alembic upgrade head` (applies all 40 migrations, including the varchar(32) fix)
   - Create default schemas (enum types, triggers, materialized views per migrations 023–039)
   - Start all four containers
   - Wait for health checks to pass
   - Open `http://localhost` in the default browser

5. **Register your first admin account:**
   - The app opens to the login page; no default username/password exists.
   - Click **Register / Sign up** and create your account.
   - This first account has admin privileges; subsequent accounts have user role by default.

### Upgrading from v1.3.0 to v2.0.0

#### Step 1: Backup Your Data (Required)
On the old machine with v1.3.0 running:
```bash
# Windows
.\scripts\backup-data.ps1

# Linux/WSL
./scripts/backup-data.sh
```
This creates a timestamped folder (e.g., `backups/20260719-143000/`) containing:
- `db.dump` — PostgreSQL dump (if on Postgres; SQLite backups via native dump)
- `uploads.tar.gz` — all uploaded documents/attachments
- `rsa_keys.tar.gz` — signing keys (session tokens remain valid after restore)

Copy the entire `backups/` folder and `.env` file to removable storage (USB, external SSD, secure cloud storage).

#### Step 2: On the New Machine (or Fresh OS Install)
```bash
# 1. Clone or extract v2.0.0 code
git clone https://github.com/blackbox-factory/bom-tool.git
cd bom-tool

# 2. Copy the .env from the old machine (never commit this!)
cp /path/to/backup/.env .

# 3. Fresh install (creates empty stack)
.\install.ps1                           # Windows
# OR
./scripts/install.sh                     # Linux/WSL

# 4. Restore data from backup
.\scripts\restore-data.ps1 backups\20260719-143000\     # Windows
# OR
./scripts/restore-data.sh backups/20260719-143000/      # Linux/WSL

# 5. App is ready; sign in with your old account
```

#### Step 3: Verify Migration
After restore completes:
- Open `http://localhost` and sign in with your old admin account.
- Check dashboard — all BOMs, parts, vendors, POs should be present.
- Click **Tenant Admin** → **Audit Logs** to confirm multi-tenancy is active.
- Run a BOM explosion to verify closure table is indexed correctly.

---

## Known Issues & Caveats

### Postgres-Specific Defects (Discovered 2026-07-19)

1. **`alembic_version.version_num` VARCHAR(32) too narrow**: revision ID `036_role_permission_tenant_scoped` is 33 characters. Fresh Postgres installs die at migration 036 without widening the column. SQLite tests never catch this because SQLite ignores VARCHAR constraints.
   - **Workaround**: Automated in `docker-compose.yml` via `docker/postgres/init.sql`, which runs `ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)` on DB init.
   - **Manual fix** (if running Postgres outside Docker): 
     ```sql
     ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64);
     ```
   - **Permanent fix pending**: upstream in `alembic/env.py` to set `version_num = Column(String(64), ...)`

2. **`alembic/env.py` only reads `DATABASE_URL`**: Alembic migrations ignore the app's `.env` file. If `DATABASE_URL` is not exported, migrations fall back to the hardcoded `sqlalchemy.url` in `alembic.ini` (default: `postgresql://bom_user@localhost/bom_db` with empty password).
   - **Workaround**: Automated in Docker; must export `DATABASE_URL` in manual Postgres setups:
     ```bash
     export DATABASE_URL="postgresql://bom_user:your_password@localhost:5432/bom_db"
     alembic upgrade head
     ```

3. **Full test suite runs on SQLite, not Postgres**: ~73 pre-existing test stubs (marked `@pytest.mark.skip` or returning dummy data) are unrelated but mean Postgres-only defects (RLS behavior, dialect SQL, type enforcement) are not covered by CI.
   - **Mitigation**: Manual integration tests with real Postgres containers recommended before enterprise deployments. See `DISASTER_RECOVERY_RUNBOOK.md` for test procedures.

---

## Deployment Topology

### Local Single-Node (Recommended for < 100 Users)
```
┌─────────────────────────────────────┐
│   This PC / On-Premises Server      │
│  (Windows 10+ or Linux)             │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  Docker Compose Stack        │   │
│  │  ┌──────────────┐            │   │
│  │  │ PostgreSQL   │            │   │
│  │  │ 15-alpine    │            │   │
│  │  └──────────────┘            │   │
│  │  ┌──────────────┐            │   │
│  │  │ Redis 7      │            │   │
│  │  └──────────────┘            │   │
│  │  ┌──────────────┐            │   │
│  │  │ FastAPI      │            │   │
│  │  │ Backend      │            │   │
│  │  └──────────────┘            │   │
│  │  ┌──────────────┐            │   │
│  │  │ nginx + SPA  │            │   │
│  │  │ (React)      │            │   │
│  │  └──────────────┘            │   │
│  └──────────────────────────────┘   │
│                                     │
│  Volumes (Persistent):              │
│  - pgdata/                          │
│  - redis_data/                      │
│  - backend_uploads/                 │
│  - rsa_keys/                        │
│  - wal_archive/ (optional WAL)      │
└─────────────────────────────────────┘

Browser → http://localhost
         (or custom port via .env)
```

### Multi-Tenant (Same Stack, Multiple Orgs)
Each registered tenant has isolated data via app-layer filtering on `tenantId`. All tenants share one PostgreSQL instance, one Redis cache, and one FastAPI process. RLS policies are opt-in (`ENABLE_RLS=true`) for air-gapped or compliance-heavy deployments.

---

## Upgrade Instructions

### From v1.3.0
See **Migration Guide** → **Upgrading from v1.3.0 to v2.0.0**, above.

### Between v2.0.x Patches
```bash
# Fetch latest code
git pull origin master

# Re-run installer (safe; applies new migrations, rebuilds only changed images)
.\install.ps1              # Windows
# OR
./scripts/install.sh        # Linux/WSL

# Your data is untouched.
```

### Manual Postgres Setup (Non-Docker)
If running Postgres outside Docker (not recommended for new deployments):
1. Ensure Postgres 15+ is installed and running.
2. Create a database and user:
   ```sql
   CREATE USER bom_user WITH PASSWORD 'your_secure_password';
   CREATE DATABASE bom_db OWNER bom_user;
   ```
3. Export the connection string and run migrations:
   ```bash
   export DATABASE_URL="postgresql://bom_user:your_secure_password@localhost:5432/bom_db"
   cd backend
   poetry install  # or pip install -r requirements.txt
   alembic upgrade head
   ```
4. Start the backend:
   ```bash
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
5. Build and serve the frontend separately (see `frontend/README.md`).

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Windows 10, macOS 11, Ubuntu 20.04 | Windows 11, Ubuntu 22.04 |
| **RAM** | 8 GB | 16 GB+ (for large BOMs, 100k+ parts) |
| **Disk** | 20 GB (OS + Docker images + empty DB) | 100 GB+ (for full backups + WAL archives) |
| **Network** | None required after deploy (fully local) | Network for Cliq, ClickUp, Zoho Books optional integrations |
| **Docker** | 4.0+ | 25.0+ |

---

## File Structure

```
bom-tool/
├── RELEASE_NOTES.md                  # This file
├── CHANGELOG.md                       # Detailed git-history changes
├── INSTALL.md                         # User-facing quickstart (Windows)
├── README.md                          # Developer quickstart
├── DISASTER_RECOVERY_RUNBOOK.md       # Enterprise backup & DR procedures
├── docker-compose.yml                 # Local-first stack definition
├── .env.example                       # Configuration template
├── install.bat                        # Windows one-click installer
├── install.ps1                        # PowerShell installer (advanced options)
├── stop.ps1 / stop.bat                # Stack control (stop, restart)
├── uninstall.ps1 / uninstall.bat      # Cleanup scripts (-Purge removes data)
│
├── backend/                           # FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── main.py                   # App entry point
│   │   ├── api/                      # 36 endpoint routers, ~500 routes
│   │   ├── models/                   # ORM (SQLAlchemy 2.0)
│   │   ├── services/                 # Business logic
│   │   ├── core/                     # Config, security, tenant isolation
│   │   └── tests/                    # pytest on SQLite
│   ├── alembic/
│   │   ├── versions/                 # 40 migrations
│   │   └── env.py                    # Migration config
│   └── requirements.txt               # Python dependencies
│
├── frontend/                          # React + Vite
│   ├── src/
│   │   ├── components/               # Primitives, screens, modals
│   │   ├── root/                     # Shim registration
│   │   ├── context/                  # AppCtx, state management
│   │   ├── api.js                    # FastAPI client
│   │   ├── styles.css                # Design tokens, theme
│   │   └── utils/                    # Helpers (storage, crypto, format)
│   ├── package.json                  # React 18.3, Vite 6.3, TypeScript 6.0
│   └── vite.config.js                # Build config
│
├── docker/                            # Docker configs
│   ├── postgres/
│   │   ├── Dockerfile                # Postgres 15-alpine
│   │   └── init.sql                  # Schema init + migration pre-fix
│   ├── backend/
│   │   └── Dockerfile                # FastAPI + Alembic
│   ├── frontend/
│   │   └── nginx.conf                # Reverse proxy for API
│   └── redis/                        # (pulled from upstream)
│
└── scripts/
    ├── backup-data.ps1 / .sh          # Point-in-time snapshot
    ├── restore-data.ps1 / .sh         # Load backup into new stack
    ├── dump-postgres.sh               # Enterprise-grade DB dump with retention
    └── transfer-volumes.sh            # Advanced: copy Docker volumes between machines
```

---

## Performance & Scalability

| Metric | Target | Notes |
|--------|--------|-------|
| **Concurrent Users** | 1–100 (single node) | Docker + Postgres handle 50–100 simultaneous API clients easily. Multi-instance deployments possible with external Postgres. |
| **Parts Database** | 100k+ | Indexed by tenant, part number, supplier; full-text search on description. |
| **BOM Size** | 10k+ line items | Closure table ensures O(1) where-used queries; 2–3 level nesting typical. |
| **API Latency** | < 200 ms (p95) | FastAPI async, connection pooling, Redis caching; no N+1 queries. |
| **DB Backup** | < 2 min (50 MB DB) | `pg_dump` + tar.gz compression; backup scheduler runs hourly on configurable window. |
| **Network Required** | None (local-first) | All data on-premises; optional Cliq/ClickUp/Zoho mirrors async via outbox pattern. |

---

## License & Support

Blackbox BOM v2.1.0 is proprietary software for Blackbox Factories. Commercial support, custom integrations, and on-premises deployment assistance available at `sumanth@blackboxfactories.com`.

---

## See Also

- **`CHANGELOG.md`** — Detailed git history since v1.3.0
- **`INSTALL.md`** — Step-by-step setup (Windows focus)
- **`README.md`** — Developer quickstart (architecture, testing, build)
- **`DISASTER_RECOVERY_RUNBOOK.md`** — Enterprise backup, RTO/RPO, high-availability options
- **`backend/README.md`** — FastAPI, migrations, test procedures
- **`frontend/README.md`** — React, design tokens, component library

# Blackbox BOM

Enterprise Bill of Materials (BOM) and Product Lifecycle Management (PLM) platform. Competes with OpenBOM, Arena PLM, Teamcenter, and Windchill.

## Overview

Full-stack BOM/PLM application with multi-tenant architecture, real-time collaboration, WebSocket presence, enterprise backup/DR, and comprehensive API surface.

- **Frontend**: React + Vite (JSX), code-split into 24 chunks
- **Backend**: FastAPI (Python 3.11+), SQLAlchemy, PostgreSQL, Redis
- **Infrastructure**: Docker Compose, Prometheus/Grafana, PgBouncer, MinIO, ngix

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 16
- Redis 7+

### Backend
```bash
cd backend
cp .env.example .env        # Configure your environment
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd "BOM and PRD"
npm install
npm run dev                 # Vite dev server on port 3001
npm run build               # Production build to dist/
```

### Docker (Local, one-click — recommended for a new machine)

Local-first: the whole stack (Postgres, Redis, backend, frontend) runs on
this machine, migrated and seeded automatically. No cloud dependency.

**Windows, one click:** double-click `install.bat` (or run `.\install.ps1`
in PowerShell). It checks for Docker Desktop, creates `.env` with generated
secrets on first run, builds and starts everything, waits for it to become
healthy, and opens your browser. Re-running it later (e.g. after
`git pull`) safely rebuilds and restarts without touching your data. Stop
with `.\stop.ps1` / `stop.bat`; fully remove with `.\uninstall.ps1`. See
**[INSTALL.md](INSTALL.md)** for the full non-expert walkthrough, including
moving the app + its data to a new PC.

**Any OS, manual:**
```bash
cp .env.example .env    # fill in the secrets — see comments in the file
docker compose up --build
```

**Or with `make`** (optional shortcuts around the same Compose commands —
see `Makefile`): `make up`, `make down`, `make logs`, `make backup`,
`make restore DIR=backups/<timestamp>`.

Then open **http://localhost** — nginx (the `frontend` container) serves the
built React SPA and reverse-proxies `/api/` and `/ws/` to the backend
(`frontend/nginx.conf`), so the whole app lives behind one localhost port.
The `backend` container's entrypoint (`backend/scripts/docker-entrypoint.sh`)
waits for Postgres, runs `alembic upgrade head`, and seeds the default RBAC
roles/permissions on a genuinely empty database before starting uvicorn —
re-running `docker compose up` on an existing install is safe and won't
re-seed or touch your data. Named volumes (`pgdata`, `backend_backups`,
`backend_uploads`, `rsa_keys`) persist across restarts and rebuilds.

**To move the app to a new PC (fresh, no existing data):** copy the repo
(or `git clone`) + your `.env` (keep it secret, never commit it), install
Docker, and run the two commands above again — a brand-new, empty, migrated
database is created automatically.

**To move the app to a new PC WITH your existing data** (database + uploaded
files + RSA signing keys): on the OLD machine, with the stack running, take
a data snapshot with the included backup script —

```bash
./scripts/backup-data.sh        # or: .\scripts\backup-data.ps1 on Windows
```

— this writes `backups/<timestamp>/` (`db.dump`, `uploads.tar.gz`,
`rsa_keys.tar.gz`). Copy the repo + your `.env` + that `backups/<timestamp>/`
folder to the NEW machine, install Docker, bring up a fresh stack, then load
the snapshot into it:

```bash
docker compose up --build -d
./scripts/restore-data.sh backups/<timestamp>   # or restore-data.ps1
```

This replaces the new stack's (still-empty) database, uploads, and RSA keys
with the ones from the old machine, so existing accounts, data, and signed
sessions/tokens carry over. See `scripts/backup-data.sh` /
`scripts/restore-data.sh` for details — both are plain Docker Compose calls
(`pg_dump`/`pg_restore` + tar over `docker compose cp`), no extra tooling
required.

### Docker (Production, full stack — monitoring/MinIO/pgBackRest)
```bash
cd backend
docker compose -f docker-compose.prod.yml up -d
```

## Key Features

- Multi-level BOM with revision control
- Part management with category/UOM/custom fields
- Vendor management with scorecards
- Purchase order workflow (RFQ → Ordered → Received)
- Engineering Change Order (ECO) with approval workflow
- Kanban inventory management
- Quality management (NCR, CAPA, FAI, Deviation)
- Real-time collaboration (WebSocket presence, cursors, locking)
- Multi-tenant with row-level isolation
- SSO (Google, GitHub, Microsoft, SAML)
- MFA/TOTP with encrypted secrets
- RBAC with 5 default roles
- Enterprise backup/DR (pg_dump, pg_basebackup, PITR, S3)
- Webhook system with event-driven subscriptions
- Prometheus metrics + Grafana dashboards
- API key authentication
- Full audit logging

## Security

This project has undergone comprehensive security auditing and remediation. Key security features:

- JWT (RS256) with algorithm confusion protection
- bcrypt password hashing
- Input sanitization (XSS prevention)
- CSRF double-submit cookie pattern
- Rate limiting (Redis-backed with in-memory fallback)
- IP-based throttling before account lockout
- Tenant isolation at ORM level (row-level security)
- Encrypted TOTP secrets (Fernet/AES)
- Encrypted RSA private key
- CORS with explicit allowed methods/headers
- Security headers (CSP, HSTS, XFO)
- Session timeout middleware
- Webhook SSRF protection

## Architecture

```
Client (React + Vite) → FastAPI → PostgreSQL + Redis
                        ├── JWT Auth + MFA
                        ├── RBAC + Tenant Isolation
                        ├── Service Layer (business logic)
                        ├── WebSocket (real-time)
                        ├── Backup Engine (pg_dump/pg_basebackup)
                        └── Monitoring (Prometheus)
```

## Documentation

| File | Description |
|------|-------------|
| `INSTALL.md` | One-click Windows install, backup/restore, moving to a new PC, troubleshooting |
| `ENTERPRISE_AUDIT_REPORT.md` | Full-spectrum enterprise audit with scores |
| `DISASTER_RECOVERY_RUNBOOK.md` | DR procedures and runbook |
| `BOM and PRD/RELEASE_NOTES.md` | Frontend release notes |
| `BOM and PRD/CHANGELOG.md` | Frontend changelog |
| `BOM and PRD/FEATURE_CATALOG.md` | Frontend feature catalog |
| `BOM and PRD/SYSTEM_WORKFLOW.md` | Frontend system workflows |
| `BOM and PRD/ARCHITECTURE.md` | Frontend architecture |
| `BOM and PRD/OPEN_ITEMS.md` | Frontend open items and tech debt |
| `BOM and PRD/TESTING_AND_VALIDATION.md` | Frontend testing guide |
| `BOM and PRD/MODULE_REFERENCE.md` | Frontend module reference |
| `backend/docs/RELEASE_NOTES.md` | Backend release notes |
| `backend/docs/CHANGELOG.md` | Backend changelog |
| `backend/docs/FEATURE_CATALOG.md` | Backend feature catalog |
| `backend/docs/SYSTEM_WORKFLOW.md` | Backend system workflows |
| `backend/docs/ARCHITECTURE.md` | Backend architecture |
| `backend/docs/OPEN_ITEMS.md` | Backend open items |
| `backend/docs/TESTING_AND_VALIDATION.md` | Backend testing guide |
| `backend/docs/MODULE_REFERENCE.md` | Backend module reference |
| `backend/docs/API_REFERENCE.md` | API reference |
| `backend/docs/admin-guide.md` | Admin guide |

## Testing

### Backend
```bash
cd backend
pytest app/tests/ -v                    # 238+ tests
pytest tests/ -v                        # Outer test suite
```

### Frontend
```bash
cd "BOM and PRD"
npx playwright test                     # E2E tests
npx tsc --noEmit                        # TypeScript check
```

## License

Proprietary — All rights reserved.

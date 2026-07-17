# Blackbox BOM — Agent Conventions

## Lint & Format Commands

### Backend (Python)
```bash
# Lint with ruff
cd backend && ruff check app/

# Format with ruff
cd backend && ruff format app/

# Type check with mypy
cd backend && mypy app/

# Run all backend tests
cd backend && python -m pytest app/tests/ -v

# Run specific test file
cd backend && python -m pytest app/tests/test_auth.py -v

# Run tests with coverage
cd backend && python -m pytest app/tests/ --cov=app --cov-report=term

# E2E tests
cd backend && python -m pytest app/tests/e2e/ -v

# Run root-level tests
cd backend && python -m pytest tests/ -v
```

### Frontend (JavaScript/JSX)
```bash
# Lint with ESLint
cd "frontend" && npx eslint .

# Format with Prettier (if configured)
cd "frontend" && npx prettier --check src/

# TypeScript type check
cd "frontend" && npx tsc --noEmit

# Run Vitest tests
cd "frontend" && npx vitest run

# Build for production
cd "frontend" && npm run build

# Dev server
cd "frontend" && npm run dev
```

### Docker
```bash
# Build production Docker images
docker compose -f backend/docker-compose.prod.yml build

# Run full dev stack
docker compose -f docker-compose.yml up -d
```

### Python Compile Check
```bash
# Quick syntax check all backend files
cd backend && python -m py_compile app/main.py app/core/deps.py app/core/backup.py
```

## Project Structure

### Backend (`backend/`)
```
app/
  main.py              # FastAPI entry point
  api/
    api_v1.py          # Central router (314 lines)
    endpoints/         # 60 endpoint router files
  core/                # 26 modules (config, security, backup, etc.)
  db/                  # session.py, base.py
  models/              # 60 model files (~126 tables)
  schemas/             # 31 Pydantic schema files
  services/            # 15 business logic files
  tests/               # 38 test files (~239 tests)
  monitoring/          # Prometheus, Sentry, health
  alembic/             # 27 migrations
scripts/               # 10 utility scripts
```

### Frontend (`frontend/`)
```
src/
  main.jsx             # Vite entry
  config.js            # Runtime configuration
  screens/
    App.jsx            # Main app shell (~722 lines)
  root/                # 23 JSX screen files (flat)
  components/          # Reusable components
  utils/               # Utility modules
  locales/             # i18n translations (en.json, ja.json)
```

## Code Conventions

### Backend
- Python 3.11+ with async/await throughout
- FastAPI with Pydantic v2 schemas
- SQLAlchemy 2.0 async ORM with asyncpg driver
- All endpoints in `app/api/endpoints/` as separate router files
- Business logic in `app/services/` — never in endpoints
- Models inherit `TenantAwareMixin` for multi-tenancy
- Use `Optional[X]` (not `X | None`) for type hints
- Use `HTTPException` (not `ValueError`) for API errors
- All 429 responses must include `Retry-After` header
- Rate limiting: Redis-backed with in-memory fallback

### Frontend
- React 18 with JSX (no TypeScript in src/)
- Vite 6 build with aggressive manual chunking
- Custom routing via `location.pathname` (not react-router)
- State via React Context (`AppCtx`) + `localStorage`
- API calls via custom `api.js` (circuit breaker, retry, CSRF)
- i18next for translations
- No component tests (gap)

### Database
- PostgreSQL 15+ with asyncpg
- All tables have `tenantId` for multi-tenancy
- Alembic for migrations (don't use `create_all()`)
- Naming convention: `ix_<table>_<col>` for indexes

## Important Notes
- ENCRYPTION_KEY must be set for backup encryption
- JWT uses RS256 (not HS256)
- Superusers require MFA in production
- API keys use bcrypt hashing with prefix lookup
- WebSocket channels are tenant-scoped
- Rate limits: 60/min general, 5/min auth, 120/min API key, 300/min user

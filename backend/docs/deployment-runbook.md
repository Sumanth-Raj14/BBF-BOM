# Blackbox BOM Management Tool — Deployment Runbook

## Prerequisites

| Component | Version | Notes |
|-----------|---------|-------|
| Python | 3.10+ | 3.11 recommended |
| PostgreSQL | 14+ | 16 recommended |
| Redis | 7.0+ | 7.2 recommended |
| Docker | 24+ | For containerized deployment |
| Docker Compose | v2.20+ | Multi-container orchestration |

Optional:
- Nginx / Caddy — reverse proxy
- MinIO / AWS S3 — file storage
- HashiCorp Vault — secret management

---

## 1. Development Setup

### Step-by-step

```bash
# 1. Clone the repository
git clone <repo-url>
cd "bom tool/backend"

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
# venv\Scripts\activate   # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment
cp .env.example .env
# Edit .env with your local settings

# 5. Start PostgreSQL and Redis (via Docker or local install)
docker run -d --name bom-postgres -e POSTGRES_USER=bom_user -e POSTGRES_PASSWORD=<strong-password> -e POSTGRES_DB=bom_db -p 5432:5432 postgres:16
docker run -d --name bom-redis -p 6379:6379 redis:7

# 6. Run database migrations (bootstrap: greenfield DBs get
#    Base.metadata.create_all() + `alembic stamp head` since the historical
#    migration chain cannot build from an empty DB; existing DBs just get
#    `alembic upgrade head`)
python -m scripts.init_db

# 7. Create initial admin user
python -m app.scripts.create_admin

# 8. Start the development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 9. Verify
curl http://localhost:8000/api/v1/health
# Should return: {"status":"healthy","service":"blackbox-bom-api"}
```

### Frontend (separate process)

```bash
cd "bom tool"
npm install
npm run dev
# Frontend at http://localhost:3000
```

---

## 2. Production Deployment (Docker-based)

### Step 1: Clone and configure

```bash
git clone <repo-url>
cd "bom tool/backend"
cp .env.example .env
# Edit .env — set strong SECRET_KEY, ENCRYPTION_KEY, database credentials
# Also set ENVIRONMENT=production for production deployments
```

### Step 2: Build and start services

```bash
docker compose up -d --build
```

### Step 3: Run migrations

```bash
docker compose exec api python -m scripts.init_db
```

This is the idempotent bootstrap: a greenfield database (no `alembic_version`
table) is built from `Base.metadata.create_all()` and stamped at `head`
(the historical migration chain cannot replay from an empty DB), while an
already-managed database just runs `alembic upgrade head` to apply pending
migrations.

### Step 4: Create admin user

```bash
docker compose exec api python -m app.scripts.create_admin
```

### Step 5: Verify all services

```bash
# Health check
curl http://localhost:8000/api/v1/health/detailed

# Metrics
curl http://localhost:8000/api/v1/metrics

# API docs
curl http://localhost:8000/api/docs
```

### Step 6: Start monitoring (optional)

```bash
docker compose -f docker-compose.monitoring.yml up -d
# Prometheus at http://localhost:9090
# Grafana at http://localhost:3001
```

---

## 3. Database Migration Procedures

### Applying migrations

```bash
# Apply all pending (idempotent bootstrap — handles both a greenfield DB via
# create_all + stamp head, and an existing managed DB via alembic upgrade head)
python -m scripts.init_db

# Apply specific migration
alembic upgrade <revision_id>

# Check current version
alembic current

# View migration history
alembic history
```

### Creating a new migration

```bash
# After modifying models in app/models/
alembic revision --autogenerate -m "description of change"

# Review the generated migration in alembic/versions/
# Then apply
python -m scripts.init_db
```

### Production migration checklist

1. Back up the database before running migrations.
2. Test the migration in staging first.
3. Run during a maintenance window if schema changes are breaking.
4. Verify application health after migration.
5. Keep migration files version-controlled.

---

## 4. Rollback Procedures

### Database rollback

```bash
# Rollback one migration
alembic downgrade -1

# Rollback to specific revision
alembic downgrade <revision_id>

# Rollback all (DANGEROUS — use with caution)
alembic downgrade base
```

### Application rollback

```bash
# If using Docker Compose:
# 1. Stop current containers
docker compose down

# 2. Checkout the previous release
git checkout <previous-tag>

# 3. Rebuild and restart
docker compose up -d --build

# 4. Apply any necessary down-migrations
docker compose exec api alembic downgrade -1

# 5. Verify
curl http://localhost:8000/api/v1/health/detailed
```

### Rollback decision tree

- **Data-only migration issue** → Restore from backup
- **Schema migration issue** → `alembic downgrade -1`
- **Application code issue** → Docker image rollback + down-migration
- **Corrupted data** → Point-in-time recovery from backups

---

## 5. Health Check Verification

### Automated health check

```bash
# Basic health
curl -s http://localhost:8000/api/v1/health | python -m json.tool

# Detailed health (includes DB, memory, disk)
curl -s http://localhost:8000/api/v1/health/detailed | python -m json.tool
```

### Expected response

```json
{
  "status": "healthy",
  "timestamp": "2026-01-01T00:00:00+00:00",
  "service": "blackbox-bom-api",
  "version": "1.0.0",
  "database": {
    "status": "connected",
    "latencyMs": 1.23
  },
  "memory": { ... },
  "disk": { ... }
}
```

### Status codes

| Status | Meaning | Action |
|--------|---------|--------|
| `healthy` | All systems operational | None |
| `degraded` | Non-critical subsystem issue | Monitor, investigate |
| `unhealthy` | Critical failure | Immediate investigation |

---

## 6. Monitoring Setup

### Prometheus

```bash
# Start Prometheus with the provided config
docker compose -f docker-compose.monitoring.yml up -d prometheus

# Verify scraping
curl http://localhost:9090/api/v1/targets
```

### Grafana

```bash
# Start Grafana
docker compose -f docker-compose.monitoring.yml up -d grafana

# Access at http://localhost:3001
# Login: admin (set GF_SECURITY_ADMIN_PASSWORD env var — DO NOT use default)
# Dashboard auto-provisioned at: BOM API / Blackbox BOM API
```

### Sentry

```bash
# Set environment variable
export SENTRY_DSN="https://xxx@sentry.io/yyy"

# Restart the application
# Errors will automatically be reported
```

### Alerting

Configure Prometheus alerting rules in `monitoring/prometheus.yml` or via the Alertmanager UI. See admin-guide.md for example alert rules.

---

## 7. Common Issues & Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| DB connection refused | `500` errors, health check shows `database.status = error` | Check PostgreSQL is running, verify credentials in `.env`, check firewall |
| Redis connection refused | Session errors, rate limiting broken | Check Redis is running, verify `REDIS_URL` in `.env` |
| Migration fails | `python -m scripts.init_db` errors | Check DB permissions, review migration file, ensure DB exists |
| Permission denied (403) | API returns forbidden | Check user roles, verify RBAC configuration |
| File upload fails | S3/MinIO connection errors | Check `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| High latency | Slow API responses | Check DB query performance, verify indexing, check connection pool |
| Memory leak | Growing RAM usage | Restart service, check for unclosed connections, review query patterns |
| WebSocket disconnects | Real-time updates stop | Check proxy timeout settings, verify WebSocket upgrade headers |
| CORS errors | Frontend can't reach API | Verify `BACKEND_CORS_ORIGINS` includes frontend URL |

---

## 8. Scaling Checklist

### Before scaling

- [ ] Confirm application works correctly at current load
- [ ] Run load tests to establish baseline performance
- [ ] Set up monitoring dashboards
- [ ] Configure alerting thresholds

### Horizontal scaling

- [ ] Deploy multiple API instances (2+ workers)
- [ ] Place behind a load balancer (Nginx, HAProxy, cloud LB)
- [ ] Use Redis for shared session state
- [ ] Configure PostgreSQL read replicas for analytics
- [ ] Use shared S3/MinIO for file storage
- [ ] Ensure WebSocket connections work across instances (sticky sessions or Redis pub/sub)

### Vertical scaling

- [ ] Increase API server CPU and RAM
- [ ] Scale PostgreSQL with more memory and faster storage
- [ ] Tune PostgreSQL connection pool and work_mem
- [ ] Upgrade to SSD storage for all data paths

### Database scaling

- [ ] Add indexes for frequently queried columns
- [ ] Partition large tables (audit_logs, price_history)
- [ ] Set up connection pooling (PgBouncer)
- [ ] Configure read replicas for analytics workloads
- [ ] Monitor slow query log

---

## 9. Security Hardening Checklist

### Authentication & authorization

- [ ] Change default admin password
- [ ] Enable MFA for admin accounts
- [ ] Configure SSO if required
- [ ] Set appropriate RBAC roles
- [ ] Set token expiration to reasonable values
- [ ] Set `ENVIRONMENT=production` in .env (auto-sets secure=True on all cookies)
- [ ] Verify HTTPS is configured (TLS 1.2+) for all traffic

### Network security

- [ ] Enable HTTPS (TLS 1.2+) for all traffic
- [ ] Restrict CORS origins to your domains only
- [ ] Place database and Redis behind firewall (not publicly accessible)
- [ ] Use VPN or private network for inter-service communication
- [ ] Enable rate limiting

### Data security

- [ ] Use strong `SECRET_KEY` and `ENCRYPTION_KEY`
- [ ] Never commit `.env` or secrets to version control
- [ ] Enable database connection SSL
- [ ] Use Vault for secret management in production
- [ ] Encrypt sensitive data at rest

### Operational security

- [ ] Run application as non-root user
- [ ] Set `ENVIRONMENT=production`
- [ ] Disable debug mode and verbose error output
- [ ] Enable audit logging (default: on)
- [ ] Regular dependency updates (`pip audit`)
- [ ] Regular database backups with tested restore
- [ ] Monitor for unusual activity via audit logs
- [ ] Set up Sentry for error tracking
- [ ] Configure log rotation
- [ ] Restrict SSH access to production servers

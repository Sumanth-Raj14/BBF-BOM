# Blackbox BOM Management Tool — Admin Guide

## 1. System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Python | 3.10+ | 3.11+ |
| PostgreSQL | 14+ | 16+ |
| Redis | 7.0+ | 7.2+ |
| RAM | 2 GB | 4 GB+ |
| Disk | 10 GB | 50 GB+ (SSD) |
| OS | Linux, macOS, Windows | Ubuntu 22.04 LTS |

Optional:
- Docker & Docker Compose (for containerized deployment)
- Nginx or Caddy (reverse proxy)
- MinIO or AWS S3 (file storage)

---

## 2. Installation

### Docker Deployment (Recommended)

```bash
git clone <repo-url>
cd "bom tool/backend"

# Copy and edit environment file
cp .env.example .env

# Start all services
docker compose up -d

# Run migrations
docker compose exec api alembic upgrade head

# Create initial admin user
docker compose exec api python -m app.scripts.create_admin
```

### Manual Deployment

```bash
# Install system dependencies
sudo apt update && sudo apt install python3.11 python3-pip postgresql redis-server

# Create database
sudo -u postgres createdb bom_db
sudo -u postgres createuser bom_user
sudo -u postgres psql -c "ALTER USER bom_user WITH PASSWORD 'bom_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bom_db TO bom_user;"

# Install Python dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URI="postgresql+asyncpg://bom_user:bom_password@localhost:5432/bom_db"
export SECRET_KEY="<generate-random-key>"
export ENCRYPTION_KEY="<generate-random-key>"

# Run migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## 3. Database Setup & Migration

### Initial Setup

```bash
# Create database and user
sudo -u postgres createdb bom_db
sudo -u postgres createuser bom_user --encrypted-password
sudo -u postgres psql -c "ALTER USER bom_user WITH PASSWORD 'bom_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bom_db TO bom_user;"
sudo -u postgres psql -d bom_db -c "GRANT ALL ON SCHEMA public TO bom_user;"
```

### Running Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Check current version
alembic current

# Generate a new migration after model changes
alembic revision --autogenerate -m "description of change"

# Rollback one step
alembic downgrade -1
```

### Migration Best Practices

- Always back up the database before running migrations in production.
- Test migrations in staging first.
- Never modify a migration that has been applied to production.
- Create a new migration to fix any issues.

---

## 4. Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URI` | `postgresql+asyncpg://bom_user:bom_password@localhost:5432/bom_db` | PostgreSQL connection string |
| `SECRET_KEY` | random | JWT signing secret |
| `ENCRYPTION_KEY` | random | Data encryption key |
| `POSTGRES_SERVER` | `127.0.0.1` | Database host |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_USER` | `bom_user` | Database user |
| `POSTGRES_PASSWORD` | `bom_password` | Database password |
| `POSTGRES_DB` | `bom_db` | Database name |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis connection URL |
| `RATE_LIMIT_PER_MINUTE` | `60` | API rate limit per IP |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO/S3 endpoint |
| `S3_ACCESS_KEY` | `minioadmin` | S3 access key |
| `S3_SECRET_KEY` | `minioadmin` | S3 secret key |
| `S3_BUCKET` | `bom-documents` | S3 bucket name |
| `BACKEND_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |
| `GOOGLE_CLIENT_ID` | `""` | Google SSO client ID |
| `GOOGLE_CLIENT_SECRET` | `""` | Google SSO secret |
| `GITHUB_CLIENT_ID` | `""` | GitHub SSO client ID |
| `GITHUB_CLIENT_SECRET` | `""` | GitHub SSO secret |
| `MICROSOFT_CLIENT_ID` | `""` | Microsoft SSO client ID |
| `MICROSOFT_CLIENT_SECRET` | `""` | Microsoft SSO secret |
| `SENTRY_DSN` | `""` | Sentry DSN for error tracking |
| `ENVIRONMENT` | `development` | Environment name |
| `APP_VERSION` | `0.20.0` | Application version |
| `VAULT_ADDR` | `""` | HashiCorp Vault address |
| `VAULT_TOKEN` | `""` | Vault auth token |

---

## 5. Security Configuration

### SSO (Single Sign-On)

Configure at least one provider in `.env`:

```env
# Google
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# GitHub
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# Microsoft
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx
```

Set `SSO_REDIRECT_URI` to your frontend callback URL.

### Multi-Factor Authentication (MFA)

- TOTP-based MFA is supported for all users.
- Users can enable MFA from their profile settings.
- Admins can force MFA for all users via role settings.

### RBAC (Role-Based Access Control)

Built-in roles:
- **Admin** — Full system access
- **Engineering** — Parts, BOMs, documents, revisions
- **Procurement** — Vendors, POs, contracts, pricing
- **Finance** — Cost reports, budget tracking
- **Viewer** — Read-only access

Custom roles can be created via the API or admin UI.

### Encryption

- JWT tokens signed with `SECRET_KEY` (HS256).
- Sensitive fields encrypted at rest with `ENCRYPTION_KEY`.
- All API traffic should be over HTTPS in production.
- Database connections use SSL when configured.

### Vault Integration

If `VAULT_ADDR` and `VAULT_TOKEN` are set, secrets are loaded from HashiCorp Vault:
- `POSTGRES_PASSWORD`
- `SECRET_KEY`
- `ENCRYPTION_KEY`
- `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- SSO client secrets

---

## 6. Monitoring & Alerting

### Prometheus

Scrape metrics from `http://localhost:8000/api/v1/metrics`.

Key metrics:
- `http_requests_total` — Request count by method, path, status
- `http_request_duration_seconds` — Request latency histogram
- `db_queries_total` — Database query count
- `db_query_duration_seconds` — DB query latency
- `active_websocket_connections` — Live WebSocket count
- `errors_total` — Error count by type

### Grafana

Import the pre-built dashboard from `monitoring/grafana/provisioning/dashboards/blackbox.json`.

Panels:
- Request rate (QPS)
- Response time percentiles (p50, p95, p99)
- Error rate
- DB query rate and latency
- Active connections and users

### Sentry

Set `SENTRY_DSN` to enable error tracking:
- Automatic exception capture from FastAPI and SQLAlchemy
- 10% trace sample rate
- Environment and release tagging

### Alerting Rules (Prometheus)

```yaml
groups:
  - name: bom-api-alerts
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate (>5%)"

      - alert: HighLatency
        expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "p95 latency > 2s"

      - alert: DatabaseDown
        expr: up{job="blackbox-bom-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "BOM API is down"
```

---

## 7. Backup & Recovery

### Database Backup

```bash
# Single backup
pg_dump -U bom_user -d bom_db -F c -f backup_$(date +%Y%m%d_%H%M%S).dump

# Automated daily backup (cron)
0 2 * * * pg_dump -U bom_user -d bom_db -F c -f /backups/bom_db_$(date +\%Y\%m\%d).dump
```

### Database Restore

```bash
# Stop the application first
pg_restore -U bom_user -d bom_db --clean --if-exists backup.dump
```

### File Storage Backup

If using MinIO:
```bash
mc mirror myminio/bom-documents /backups/s3/
```

### Recovery Procedure

1. Restore database from backup.
2. Restore S3 file storage if needed.
3. Run `alembic upgrade head` to ensure schema is current.
4. Restart the application.
5. Verify via `/api/v1/health/detailed`.

---

## 8. Performance Tuning

### PostgreSQL

```sql
-- Recommended postgresql.conf settings
shared_buffers = 256MB          # 25% of RAM
effective_cache_size = 768MB    # 75% of RAM
work_mem = 16MB
maintenance_work_mem = 128MB
max_connections = 100
random_page_cost = 1.1          # SSD storage
```

### Application

- Use connection pooling (configured via `DATABASE_URI` with pool parameters).
- Enable Redis caching for frequently accessed data.
- Use `--workers 4` with uvicorn for multi-process.
- Set `RATE_LIMIT_PER_MINUTE` to prevent abuse.

### Caching Strategy

- Part lookups: cache for 5 minutes.
- BOM structures: cache for 1 minute (invalidate on edit).
- Analytics queries: cache for 15 minutes.
- User sessions: Redis-backed with configurable TTL.

---

## 9. Scaling Guidelines

### Vertical Scaling

- Increase RAM and CPU for the API server.
- Scale PostgreSQL with more memory and CPU.
- Use SSD storage for all data paths.

### Horizontal Scaling

- Run multiple API instances behind a load balancer.
- Use Redis for shared session state.
- PostgreSQL read replicas for analytics queries.
- S3/MinIO for shared file storage.

### Load Balancer Configuration

```nginx
upstream bom_api {
    server api1:8000;
    server api2:8000;
    server api3:8000;
}

server {
    listen 443 ssl;
    location / {
        proxy_pass http://bom_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://bom_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 10. Security Hardening Checklist

- [ ] Use HTTPS in production (TLS 1.2+)
- [ ] Set strong `SECRET_KEY` and `ENCRYPTION_KEY`
- [ ] Change default database credentials
- [ ] Enable RBAC and assign least-privilege roles
- [ ] Enable MFA for admin accounts
- [ ] Configure CORS to allow only your domains
- [ ] Set rate limits appropriate for your usage
- [ ] Enable audit logging (default: on)
- [ ] Regular database backups with tested restore
- [ ] Monitor via Prometheus/Grafana and set alerts
- [ ] Enable Sentry for error tracking
- [ ] Rotate secrets periodically
- [ ] Keep dependencies updated (`pip audit`)
- [ ] Use Vault for secret management in production
- [ ] Restrict network access to PostgreSQL and Redis
- [ ] Enable connection SSL for database
- [ ] Run application as non-root user
- [ ] Set `ENVIRONMENT=production` in production
- [ ] Disable debug mode and verbose error messages

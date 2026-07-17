# Disaster Recovery Runbook — Blackbox BOM Tool

## Table of Contents
1. [Recovery Scenarios](#recovery-scenarios)
2. [Backup Verification](#backup-verification)
3. [Full Database Restore](#full-database-restore)
4. [Point-in-Time Recovery (PITR)](#point-in-time-recovery-pitr)
5. [Schema-Only Restore](#schema-only-restore)
6. [Single Table Restore](#single-table-restore)
7. [Application Recovery](#application-recovery)
8. [Post-Recovery Validation](#post-recovery-validation)
9. [Encryption & Decryption](#encryption--decryption)
10. [Escalation Contacts](#escalation-contacts)

---

## RPO/RTO Definitions & Tracking

### Current Targets

| Metric | Target | Measurement Method | Monitored By |
|--------|--------|-------------------|--------------|
| **RPO** | <6 hours | Time since last verified backup | `recovery_test.py --rpo-rto` |
| **RTO (logical)** | <30 minutes | Time to restore logical backup | `recovery_test.py --full` |
| **RTO (physical)** | <4 hours | Time to restore physical backup + replay WAL | Manual drill |
| **RTO (full server loss)** | <4 hours | Time to provision + restore on new server | Quarterly drill |

### RPO Tracking

Current RPO is calculated by the recovery test script:
```bash
python scripts/recovery_test.py
# Reports: "Current RPO: 2.3h (target: <6h)"
```

RPO should be monitored via:
1. **Automatic**: Recovery test script in CI/CD pipeline
2. **Dashboard**: Grafana panel showing backup freshness (see monitoring setup)
3. **Alert**: If RPO exceeds 6 hours, PagerDuty/OpsGenie alert triggered

### RTO Tracking

RTO is measured during recovery drills:
1. Start timer when incident declared
2. Run `python -m scripts.restore_wizard --latest`
3. Verify application health at `GET /health`
4. Stop timer when API returns `healthy` status

## Recovery Scenarios

| Severity | Scenario | RTO Target | RPO Target | Procedure |
|----------|----------|------------|------------|-----------|
| **CRITICAL** | Database corrupted / deleted | 30 min | 6 hours | Full restore from latest verified backup |
| **HIGH** | Schema accidentally altered | 2 hours | 24 hours | Schema-only restore + data replay |
| **MEDIUM** | Single table data loss | 4 hours | 24 hours | Table-level restore |
| **LOW** | Application config lost | 1 hour | N/A | Redeploy from repo |
| **CRITICAL** | Full server loss | 4 hours | 6 hours | Full restore on new server |

---

## Backup Verification

### Automated verification (built into pipeline)

```bash
# Verify a backup via API
curl -X POST http://localhost:8000/api/v1/backup/verify/5 \
  -H "Authorization: Bearer <token>"

# Run full backup pipeline (backup + verify + cleanup)
curl -X POST http://localhost:8000/api/v1/backup/pipeline \
  -H "Authorization: Bearer <token>"
```

### Manual verification

```bash
# List backup contents without restoring
pg_restore --list /backups/bom_db_full_20250101_020000.dump.gz

# Test restore to a temp database
createdb -U postgres bom_db_verify
gunzip -c /backups/bom_db_full_20250101_020000.dump.gz | pg_restore -U postgres -d bom_db_verify --no-owner --no-acl
pg_dump -U postgres -d bom_db_verify -s | grep -c "CREATE TABLE"
dropdb -U postgres bom_db_verify
```

---

## Full Database Restore

### Using the Restore Wizard (Recommended)

```bash
# Interactive mode
python -m scripts.restore_wizard

# List available backups
python -m scripts.restore_wizard --list

# Restore specific backup
python -m scripts.restore_wizard --backup-id=5

# Restore latest verified backup
python -m scripts.restore_wizard --latest

# Dry-run with latest backup
python -m scripts.restore_wizard --dry-run --latest
```

### Physical Backup Restore (Automated)

Physical backups (pg_basebackup) are restored programmatically — no manual steps needed:

```bash
# Via restore wizard (auto-detects backup type)
python -m scripts.restore_wizard --backup-id=5

# The restore handles:
# 1. Decryption (if encrypted with Fernet)
# 2. Extraction of base.tar.gz to PostgreSQL data directory
# 3. Writing recovery.signal for PITR readiness
# 4. Writing blackbox_recovery.conf for WAL replay

# For automated recovery testing:
python scripts/recovery_test.py --full --physical
```

### Manual restore (with encryption support)

Backup files may be encrypted (suffix `.enc`) and/or compressed (suffix `.gz`). The automated restore wizard handles this, but for manual restore:

```bash
# 1. Identify the backup
ls -la /backups/

# 2. Decrypt if encrypted (Fernet AES-128-CBC + HMAC-SHA256)
# Use the Python streaming decryptor:
python -c "
import asyncio
from pathlib import Path
from app.core.backup import _get_fernet, _stream_decrypt

fernet = _get_fernet()
encrypted = Path('/backups/bom_db_full_20250101_020000.dump.gz.enc')
decrypted = encrypted.with_suffix('')  # removes .enc -> .dump.gz
asyncio.run(_stream_decrypt(encrypted, decrypted, fernet))
print(f'Decrypted to {decrypted}')
"

# 3. Decompress if still gzipped
gunzip -k /backups/bom_db_full_20250101_020000.dump.gz

# 4. Terminate connections to the database
psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='bom_db' AND pid <> pg_backend_pid();"

# 5. Drop and recreate
psql -U postgres -c "DROP DATABASE IF EXISTS bom_db;"
psql -U postgres -c "CREATE DATABASE bom_db OWNER bom_user;"

# 6. Restore
pg_restore -U postgres -d bom_db --verbose --no-owner --no-acl /backups/bom_db_full_20250101_020000.dump

# 7. Verify
psql -U postgres -d bom_db -c "\dt" | wc -l
```

**Important**: The `ENCRYPTION_KEY` environment variable must be set to the same value used during backup creation. This is configured in `.env` or via Vault. Without the correct key, encrypted backups cannot be restored.

---

## Point-in-Time Recovery (PITR)

**Prerequisite**: WAL archiving must be configured (see WAL Configuration section).

### Steps

```bash
# 1. Restore base backup
pg_restore -U postgres -d bom_db --verbose --no-owner --no-acl /backups/bom_db_full_20250101_020000.dump

# 2. Configure recovery.conf
cat > /var/lib/postgresql/16/main/recovery.conf << EOF
restore_command = 'cp /var/lib/postgresql/16/main/archive/%f %p'
recovery_target_time = '2025-01-01 03:30:00 UTC'
recovery_target_action = 'promote'
EOF

# 3. Restart PostgreSQL (will replay WAL and promote)
sudo systemctl restart postgresql

# 4. Verify
psql -U postgres -d bom_db -c "SELECT NOW();"
```

### WAL Configuration

```ini
# Add to postgresql.conf:
wal_level = replica
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/16/main/archive/%f'
archive_timeout = 60
```

Create archive directory:
```bash
sudo mkdir -p /var/lib/postgresql/16/main/archive
sudo chown postgres:postgres /var/lib/postgresql/16/main/archive
```

---

## Schema-Only Restore

Useful when data is intact but schema was accidentally modified.

```bash
# Create a schema-only backup
python -c "
import asyncio
from app.core.backup import create_backup, BackupType
result = asyncio.run(create_backup(BackupType.SCHEMA_ONLY))
print(f'Schema backup: {result.storage_path}')
"

# Restore schema to a temp database
createdb -U postgres bom_db_schema_restore
pg_restore -U postgres -d bom_db_schema_restore --no-owner --no-acl --schema-only /backups/bom_db_schema_20250101.dump

# Generate ALTER scripts to fix schema differences
pg_dump -U postgres -s bom_db > current_schema.sql
pg_dump -U postgres -s bom_db_schema_restore > target_schema.sql
diff current_schema.sql target_schema.sql > schema_diff.sql
```

---

## Single Table Restore

```bash
# Restore single table from a full backup
pg_restore -U postgres -d bom_db \
  --no-owner --no-acl \
  --table=parts \
  --data-only \
  /backups/bom_db_full_20250101_020000.dump

# Or use the table-level backup
gunzip -c /backups/bom_db_parts_table_20250101.dump.gz | pg_restore -U postgres -d bom_db --no-owner --no-acl
```

---

## Application Recovery

### Backend

```bash
# 1. Pull latest code
cd /path/to/bom-tool-v1/backend
git pull

# 2. Install dependencies
pip install -r requirements.txt

# 3. Verify database connectivity
python -c "from app.db.session import AsyncSessionLocal; import asyncio; asyncio.run(AsyncSessionLocal().execute(text('SELECT 1')))"

# 4. Start server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend

```bash
# 1. Navigate to frontend directory
cd /path/to/bom-tool-v1/BOM\ and\ PRD

# 2. Start the frontend server
python serve.py

# 3. Verify at http://localhost:3001
```

### After Restore — Critical Steps

1. Verify user accounts exist:
   ```bash
   psql -U postgres -d bom_db -c "SELECT COUNT(*) FROM users;"
   ```

2. Verify admin credentials via API:
   ```bash
   # Test login via API (use actual admin credentials)
   curl -X POST http://localhost:8000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@yourcompany.com","password":"<admin-password>"}'
   ```

3. Run pending migrations:
   ```bash
   python -m scripts.run_migration 009_backup_and_schema_fixes
   python -m scripts.run_migration 010_po_consolidation
   python -m scripts.run_migration 011_user_data_sync
   ```

4. Verify backup system works:
   ```bash
   curl -X POST http://localhost:8000/api/v1/backup/create \
     -H "Authorization: Bearer <token>" \
     -d '{"backup_type":"full"}'
   ```

---

## Post-Recovery Validation

### Database Health

```bash
# Check all tables exist
psql -U postgres -d bom_db -c "\dt" | wc -l

# Check row counts for critical tables
psql -U postgres -d bom_db << SQL
SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'parts', COUNT(*) FROM parts
UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'po_headers', COUNT(*) FROM po_headers
UNION ALL SELECT 'vendors', COUNT(*) FROM vendors;
SQL

# Check foreign key integrity
psql -U postgres -d bom_db -c "SELECT 'FK violations found' WHERE EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND NOT EXISTS (SELECT 1 FROM (SELECT true) t WHERE true));"
```

### Application Health

```bash
# Check API health
curl http://localhost:8000/api/v1/health

# Check detailed health
curl http://localhost:8000/api/v1/health/detailed

# Check metrics endpoint
curl http://localhost:8000/api/v1/metrics
```

### Security Validation

```bash
# Verify auth endpoint (set ADMIN_EMAIL/ADMIN_PASSWORD to your seeded admin credentials;
# there is no default password — see SEED_ADMIN_PASSWORD in seed_db.py)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"

# Verify superuser access to backup
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/backup/history
```

---

## Encryption & Decryption

Backup files are encrypted using Fernet (symmetric AES-128-CBC) with a key derived from `settings.ENCRYPTION_KEY`. Encryption is applied after gzip compression and decryption before decompression during restore.

### Encryption Algorithm

- **Cipher**: AES-128-CBC via Fernet (cryptography library)
- **Key derivation**: SHA-256 hash of `settings.ENCRYPTION_KEY`, truncated to 32 bytes, base64-encoded
- **Chunk size**: 64 MB (`_ENCRYPTION_CHUNK_SIZE` in `backup.py:23`)
- **Streaming mode**: Large backups are processed in fixed-size chunks to prevent OOM

### Encrypt a Backup

```bash
# Backup is automatically encrypted during create_backup() via stream_encrypt()
python -c "
from app.core.backup import stream_encrypt
with open('backup.dump.gz', 'rb') as f_in, open('backup.encrypted', 'wb') as f_out:
    stream_encrypt(f_in, f_out)
"
```

### Decrypt a Backup

```bash
python -c "
from app.core.backup import stream_decrypt
with open('backup.encrypted', 'rb') as f_in, open('backup_decrypted.dump.gz', 'wb') as f_out:
    stream_decrypt(f_in, f_out)
"
```

### Verify Encryption Key

```bash
# Check that the encryption key is set (non-empty)
python -c "from app.core.config import settings; assert settings.ENCRYPTION_KEY, 'ENCRYPTION_KEY is not set'; print('Key configured: OK')"
```

### Key Rotation

To rotate the encryption key:
1. Set new `ENCRYPTION_KEY` in your environment
2. All NEW backups will be encrypted with the new key
3. OLD backups remain encrypted with the previous key — keep a record of previous keys
4. Re-encrypt old backups if needed: decrypt with old key, re-encrypt with new key

---

## Backup Configuration Reference

| Setting | Value | Location |
|---------|-------|----------|
| Backup directory | `./backups` | `config.py:BACKUP_DIR` |
| Daily retention | 7 days | `backup.py:RETENTION_DAYS` |
| Weekly retention | 30 days | `backup.py:RETENTION_DAYS` |
| Monthly retention | 365 days | `backup.py:RETENTION_DAYS` |
| Yearly retention | 7 years | `backup.py:RETENTION_DAYS` |
| Scheduler time | 02:00 daily | `backup_scheduler.py` |
| pg_dump format | Custom (Fc) | `backup.py:create_backup()` |
| Compression | gzip | `backup.py:create_backup()` |
| Encryption | Fernet (AES-128-CBC) | `backup.py:stream_encrypt/decrypt` |
| Encryption chunk size | 64 MB | `backup.py:_ENCRYPTION_CHUNK_SIZE` |
| Encryption key | `settings.ENCRYPTION_KEY` | `config.py:ENCRYPTION_KEY` |
| Dual storage | Local + S3 | `backup.py:run_backup_pipeline()` |
| Retention tiers | DAILY (7d), WEEKLY (30d), MONTHLY (365d), YEARLY (7yr) | `backup.py:RETENTION_TIER_ROUTER` |

---

## Escalation Contacts

| Role | Contact |
|------|---------|
| Database Administrator | postgres@localhost |
| System Administrator | admin@blackbox.com |
| Application Owner | dev@blackbox.com |

---

## Automated Health Checks (v1.18.0)

### Startup Health Verification
- **Automatic check on every application start** (FastAPI lifespan):
  - Database connectivity test
  - Table count (early schema drift detection)
  - WAL level verification (must be `replica` for PITR)
  - Archive mode verification (must be `on`)
  - FK constraint count
  - Index count
  - Backup directory existence
  - Existing backup file count
- **Result logging**: HEALTHY (info), DEGRADED (warning), UNHEALTHY (error)
- Does NOT block application startup on degraded status (graceful degradation)

### Health API Endpoint (v1.34.0+)
- `GET /health` returns JSON (sanitized in v1.34.0 — no longer exposes `checks`, PITR, or WAL details):
  ```json
  {
    "status": "healthy",
    "database": "healthy",
    "backup": "ok",
    "timestamp": "2026-06-26T..."
  }
  ```
- Designed for load balancer health probes, Kubernetes liveness/readiness checks, Prometheus monitoring
- **Security note**: Detailed health information (table counts, FK/index counts, WAL level, archive mode) was removed from `/health` in v1.34.0 and is only available via the authenticated `/api/v1/health/detailed` endpoint

## Recovery Test Schedule

- **Daily**: Automated backup + verification (via scheduler) + health check endpoint poll
- **Weekly**: Review backup logs, verification status, and health check history. Run `python scripts/recovery_test.py`
- **Monthly**: Full restore test to isolated environment. Run `python scripts/recovery_test.py --full`
- **Quarterly**: DR drill with full server loss scenario. Include physical backup restore test.
- **Per-Release**: Run `python scripts/recovery_test.py --full --physical` before production deployment.

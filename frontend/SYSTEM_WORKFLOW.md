# Blackbox BOM — System Workflow

## Security Validation Flows (v1.33.0)

### JWT Algorithm Verification
```
verify_token(token):
  → jwt.get_unverified_header(token) → Extract "alg" claim
    → Is alg in settings.JWT_ALGORITHM?
      → YES: jwt.decode(token, key, algorithms=[alg]) → Return payload
      → NO: Raise InvalidTokenError("Algorithm mismatch")
```

### IP Rate Limiting (Before Account Lockout)
```
POST /auth/login request from IP X.X.X.X:
  → _check_ip_rate_limit(ip_address, action="login")
    → Check _ip_attempts cache
      → < 10 attempts in 60s: Allow, increment counter
      → >= 10 attempts: Raise HTTPException(429, "Too many requests")
  → If IP rate limit passes:
    → Check account credentials
      → Failed: Increment _login_attempts[email]
        → >= 5 attempts: Lock account for 15 minutes
        → < 5 attempts: Return 401
```

### CORS Hardening
```
Request with Origin header:
  → CORSMiddleware checks origin against allow_origins
  → If allowed:
    → Allow only specified methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
    → Allow only specified headers: Content-Type, Authorization, X-API-Key, 
      X-CSRF-Token, X-Requested-With, Accept, Origin, Referer
  → If not allowed: Block with CORS error
```

### WebSocket Tenant Scoping
```
Client connects to WebSocket:
  → get_current_user via JWT → Extract tenantId
  → Generate scoped_channel = f"user:{user.id}:tenant:{tenantId}"
  → Subscribe to scoped_channel
  → On broadcast: Publish to scoped_channel (NOT global channel)
  → On disconnect: Remove scoped_channel subscription
```

### Sanitization Pipeline
```
Incoming Request Body:
  → Parse Content-Type
    → application/json:
      → json.loads(body) → Walk JSON tree
        → String values: Strip XSS patterns (script tags, event handlers, etc.)
        → _strip_xss_from_json(value) — regex-based XSS pattern removal
    → application/x-www-form-urlencoded:
      → urllib.parse.parse_qs → Sanitize each value → urllib.encode
    → Parse failure: Log warning, pass original body (defense-in-depth
      — downstream sanitization applies)
  → Pass sanitized body to endpoint
```

### Password Reset Security Flow (v1.33.0)
```
POST /auth/forgot-password:
  → _check_ip_rate_limit(ip_address, "forgot-password") — 3/hour per IP
  → Generate bcrypt-hashed reset token, store with 1h TTL
  → Send email via SMTP (no timing leak — always returns 200)

POST /auth/reset-password:
  → _check_ip_rate_limit(ip_address, "reset-password") — 5/hour per IP
  → Load all users with unexpired tokens (O(n) bcrypt scan — necessary)
  → bcrypt.verify(token, hashed_token) → Match found?
    → YES: Update password, invalidate token
    → NO: Return 400
```

### API Key Authentication Flow (v1.33.0)
```
Request with X-API-Key header:
  → Extract key_prefix = api_key[:4] + "_" (first 4 chars before separator)
  → Look up by key_prefix index
  → bcrypt.verify(full_key, stored_hash)
    → Match: Attach user to request
    → No match OR expired: Return 401
```

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                              │
│  ┌────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ index.html │  │ 19 JSX Files     │  │ data.js         │  │
│  │ (Entry)    │  │ (Babel Transpile)│  │ (Static BOM)    │  │
│  └─────┬──────┘  └────────┬─────────┘  └────────┬────────┘  │
│        └──────────────────┼─────────────────────┘            │
│                           ▼                                  │
│              ┌────────────────────────┐                      │
│              │ React Context (AppCtx) │                      │
│              │  ┌──────────────────┐  │                      │
│              │  │ rows, vendors,   │  │                      │
│              │  │ comments, user,  │  │                      │
│              │  │ project, modal   │  │                      │
│              │  └──────────────────┘  │                      │
│              └────────────┬───────────┘                      │
│                           │ side-effect                      │
│                           ▼                                  │
│              ┌────────────────────────┐                      │
│              │    localStorage        │                      │
│              │  bom_data, comments,   │                      │
│              │  vendors, user, ...    │                      │
│              └────────────────────────┘                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP REST
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (FastAPI)                          │
│  ┌────────────────┐  ┌────────────┐  ┌────────────────┐     │
│  │ Authentication │  │ BOM CRUD   │  │ Analytics      │     │
│  │ JWT + bcrypt   │  │ Parts      │  │ Summaries      │     │
│  │ Rate Limiting  │  │ Vendors    │  │ Reports        │     │
│  └────────┬───────┘  └─────┬──────┘  └───────┬────────┘     │
│           └────────────────┼──────────────────┘              │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────┐       │
│  │                   PostgreSQL                      │       │
│  │  users | boms | bom_items | parts | vendors |     │       │
│  │  purchase_orders | documents | audit_log | ...    │       │
│  └──────────────────────────────────────────────────┘       │
│  ┌────────────────┐  ┌────────────────┐                     │
│  │ Redis (Cache)  │  │ Redis (Session)│                     │
│  └────────────────┘  └────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## User Journeys

### 1. First-Time User (Onboarding)
```
Landing Page → Sign Up (SSO or Email) → Profile Setup →
Workspace Setup → Invite Team → Create First BOM → Dashboard
```

### 2. Engineer — Component Selection
```
Dashboard → Component Library → Search/Filter Parts →
Compare Alternatives → Add to BOM → Edit Quantities →
Save BOM → Request Approval
```

### 3. Buyer — Procurement
```
Dashboard → View BOM → Select Part → Send RFQ →
Compare Vendor Quotes → Create PO → Track Order →
Receive & Verify → Update Inventory
```

### 4. Manager — Oversight
```
Dashboard → Review KPIs → Monitor Budget →
Approve Pending Requests → View Analytics →
Generate Reports → Manage Team
```

## Module Interaction Flow

### BOM Creation Flow
```
User clicks "New BOM"
  → app.jsx:openModal("newBOM")
    → modals-extra.jsx:NewBOMModal
      → User enters project name, selects template
        → Creates BOM in context (ctx.setRows)
          → Saves to localStorage
            → Redirects to BOM Editor
              → bom-editor.jsx renders table
```

### Part Add Flow
```
User browses Component Library (parts-screen.jsx)
  → Clicks "Add to BOM" on a part card
    → parts-screen.jsx:addPartToBom(part)
      → ctx.setRows([...ctx.rows, newRow])
        → app.jsx:530 saves to localStorage
          → BOM Editor table updates (reads ctx.rows)
```

### Vendor Management Flow
```
User navigates to Vendors (secondary-screens.jsx)
  → Views vendor list (reads ctx.vendors || window.BOM_DATA.vendors)
    → Clicks vendor row
      → Opens VendorDetailModal (modals-extra.jsx)
        → User edits contact, rating, notes
          → ctx.setVendors(updatedList)
            → localStorage updated
```

### PO Lifecycle Flow
```
Buyer creates PO (secondary-screens.jsx)
  → Status: "Not Ordered"
    → Sends RFQ to vendors
      → Status: "RFQ Sent"
        → Vendor responds with quote
          → Buyer accepts
            → Status: "Ordered"
              → Vendor ships
                → Status: "Shipped"
                  → Buyer receives
                    → Status: "Received"
```

### Document Upload Flow
```
User clicks "Upload" button
  → app.jsx:openModal("upload")
    → UploadModal (modals-extra.jsx)
      → User selects file + sets component/category
        → api.js:POST /api/v1/documents/upload
          → Backend stores file, creates DB record
            → Modal closes, document list refreshes
```

## State Transitions

### BOM Row States
```
draft → in_review → approved → released → obsolete
   ↑         ↓            ↓           ↓
   └── rejected        changes     superseded
```

### PO Status Flow
```
Not Ordered → RFQ Sent → Ordered → Shipped → Received → Closed
     ↓           ↓          ↓          ↓
  Cancelled   Expired   Cancelled  Returned
```

### ECR Status Flow
```
Draft → Under Review → Approved → Implemented → Closed
  ↑         ↓              ↓
  └── Rejected          Deferred
```

### User Roles
```
admin → full access
manager → approve/reject, view all analytics
buyer → procurement, PO management
engineer → BOM editing, component selection
viewer → read-only access
```

## Request Lifecycle

### Frontend Request (api.js)
```
1. User action triggers API call
2. api.js adds Authorization header from localStorage
3. Fetch request sent to backend:8000
4. Backend validates JWT token
5. Backend processes request
6. Backend returns JSON response
7. Frontend updates context/state
8. UI re-renders with new data
9. localStorage side-effect persists changes
```

### Error Handling Flow
```
API Call → try/catch
  ├─ Success → Update state → Re-render
  └─ Error
       ├─ 401 → Clear token → Redirect to login
       ├─ 403 → Toast "Permission denied"
       ├─ 404 → Toast "Not found"
       ├─ 500 → Toast "Server error"
       └─ Network → Toast "Connection failed"
```

## Notification Flow

### Toast Notifications
```
Event occurs → window.toast(message, {kind, duration})
  → ToastHost renders toast component
    → Auto-dismiss after 3400ms (or custom duration)
    → Manual dismiss via X button
    → Action button (if provided) triggers callback
```

### In-App Notifications
```
Backend event → POST /api/v1/notifications
  → Stored in notifications table
    → Frontend polls GET /api/v1/notifications
      → NotificationBell badge updates
        → User clicks → Notification list opens
```

## Background Task Flow

### Auto-Refresh (ActivityScreen)
```
Component mounts → Start 15s interval
  → Fetch latest activity from API
    → Update activity state
      → Re-render list
        → Component unmounts → Clear interval
```

### Backup Scheduler (Backend)
```
FastAPI lifespan startup
  → Start background task
    → Every BACKUP_SCHEDULE_HOURS
      → pg_dump database
        → Compress backup
          → Store in backup directory
```

## Integration Flow

### ERP Connector Flow
```
User configures connector (ClickUp, Zoho Cliq, etc.)
  → Enters API key + workspace ID
    → Test connection endpoint
      → Backend validates credentials
        → Stores encrypted in database
          → Sync triggers on schedule/manual
            → Data mapped between systems
```

### CAD Import Flow
```
User opens CAD Import Modal
  → Selects file (.sldasm, .step, .iges)
    → OR enters PDM URL
      → Backend parses CAD metadata
        → Extracts BOM structure
          → Creates parts in catalog
            → Returns import summary
```

## Recovery Flow

### Data Recovery
```
Corrupted localStorage → Detect on app load
  → Fall back to window.BOM_DATA (static)
    → User notified via toast
      → Can reload from last backup
```

### Session Recovery
```
Expired JWT token → 401 response
  → api.js interceptor catches
    → Clears localStorage
      → Redirects to login
        → User re-authenticates
          → Session restored
```

## Performance Optimization Flow (v1.11.0)

### N+1 Query Elimination (BOM Enterprise)
```
Before (v1.10.0):
  BOM Explosion: 1 query for BOMItems + N queries for Parts (N=items)
  Cost Rollup:   1 query for BOMItems + N queries for Parts + M queries for ancestor levels
  Where-Used:    1 query for BOMItems + N queries for BOMs + P queries for parent chain
  Total: ~4N+ queries for a BOM with N items

After (v1.11.0):
  BOM Explosion: 1 query for BOMItems + 1 batch query for ALL Parts
  Cost Rollup:   1 query for BOMItems + 1 batch query for ALL Parts + 1 query for ALL ancestors
  Where-Used:    1 query for BOMItems + 1 batch query for ALL BOMs + 1 query for ALL parent Items
  Total: 3-6 queries regardless of N (O(1) instead of O(N))
```

### Redis Caching Flow (Applied)
```
GET /api/v1/bom/{id}/explosion
  → Check Redis cache (key: "bom:explosion:{bom_id}:{level}")
    → HIT: Return cached BomExplosionItem list
    → MISS: Query DB → Build tree → Store in Redis (TTL: 300s) → Return

GET /api/v1/bom/{id}/cost-rollup
  → Check Redis cache (key: "bom:cost_rollup:{bom_id}")
    → HIT: Return cached CostRollupResponse
    → MISS: Query DB → Calculate → Store (TTL: 300s)

GET /api/v1/bom/where-used/{part_id}
  → Check Redis cache (key: "bom:where_used:{part_id}")
    → HIT: Return cached WhereUsedItem list
    → MISS: Query DB → Calculate → Store (TTL: 300s)
```

### Full-Text Search Flow
```
User types search query "resistor 10k"
  → FTS primary: to_tsvector('english', ...) @@ plainto_tsquery('english', 'resistor 10k')
    → Uses GIN index (created in migration 012)
      → ts_rank() for relevance scoring
        → Exact matches boosted first
  → ILIKE fallback: pn ILIKE '%resistor 10k%' OR name ILIKE '%resistor 10k%'
    → Preserves substring matching for short queries
  → Results sorted by relevance DESC
```

### Real DB Query Metrics Flow
```
SQLAlchemy engine executes query
  → before_cursor_execute event: conn.info["query_start_time"] = time.time()
    → Query executes against PostgreSQL
      → after_cursor_execute event: duration = time.time() - start
        → metrics.record_db_query(duration) records actual query duration
          → Prometheus histogram updated with real data
```

## Database Migration Flow (v1.10.0)

### Migration 013 — Enterprise Audit Fixes
```
Phase 4/5 Audit Findings
  → Missing boms/bom_items_master tables
    → CREATE TABLE IF NOT EXISTS boms
      → CREATE TABLE IF NOT EXISTS bom_items_master
        → ALTER TABLE documents: add isPublic, purchaseOrderId, replacesDocumentId
          → ADD FK constraints on documents.partId, documents.projectId
            → ALTER TABLE audit_logs: add userEmail, rename ipAddress→userIp
              → ADD FK constraint on audit_logs.userId
                → CREATE INDEX (30+) on FK columns across all tables
                  → ADD UNIQUE constraints (7) for data integrity
                    → ADD FK on exchange_rates.from_currency/to_currency
```

### Migration 014 — JSON Column Normalization
```
Denormalized JSON columns identified
  → contracts.partIds → contract_parts (many-to-many)
    → fai_reports.characteristics → fai_characteristics
      → serial_numbers.statusHistory → serial_number_events
        → capas.attachments → capa_attachments
          → deviations.affectedLotNumbers → deviation_lots
            → Data migration: INSERT INTO ... SELECT FROM json_array_elements
              → Indexes on FK columns
```

## HTTPS/TLS Flow (v1.25.0)
```
Client → HTTP (port 80)
  → nginx 301 redirect → HTTPS (port 443)
    → TLS 1.2/1.3 handshake
      → Modern cipher negotiation (ECDHE+AES-GCM)
        → HSTS header set (max-age=63072000, includeSubDomains)
          → Request reaches FastAPI backend (port 8000)
```

### SSL Certificate Generation
```
powershell -File ssl/generate-certs.ps1
  → Generates self-signed CA + server cert (365 day validity)
    → Places in ssl/ directory
      → Mounted to nginx at /etc/nginx/ssl
```

## JWT Authentication Flow (v1.25.0 — Migrated to PyJWT, v1.32.0 — Algorithm Confusion Fix)
```
Login Request
  → security.py:verify_token() uses PyJWT (was python-jose)
    → jwt.decode(token, key, algorithms=[settings.ALGORITHM])  ← v1.32.0: No HS256 fallback
      → Success: Returns payload dict
      → InvalidTokenError: Returns None (was JWTError)
```

### v1.32.0 Security Fixes — Updated Flows

#### SQL Injection Prevention (analytics.py / dashboard_service.py)
```
Before (v1.31.0):
  tenantId = current_user.tenantId
  tf = f'"tenantId" = {tenantId}'          ← SQL injection via JWT claim
  result = await db.execute(text(f"SELECT ... WHERE {tf}"))

After (v1.32.0):
  tf, params = _tenant_filter_params(current_user)
  # tf = '"tenantId" = :tenantId'
  # params = {"tenantId": current_user.tenantId}
  result = await db.execute(text(f"SELECT ... WHERE {tf}"), params)
                                           ← Bound parameter, safe
```

#### Backup MFA Enforcement
```
Before (v1.31.0):
  current_user: User = Depends(get_current_user)
  if not current_user.isSuperuser:
      raise HTTPException(403)             ← No MFA check

After (v1.32.0):
  current_user: User = Depends(get_current_superuser)
                                           ← Enforces MFA in production
```

#### Webhook Tenant Scoping
```
Before (v1.31.0):
  @router.get("", response_model=list[...])
  async def list_subscriptions(db):        ← No current_user
      items = await webhook_service.list_subscriptions(db)
                                           ← Returns ALL tenants' subscriptions

After (v1.32.0):
  @router.get("", response_model=list[...])
  async def list_subscriptions(db, current_user):
      items = await webhook_service.list_subscriptions(db, current_user)
                                           ← Filters by tenantId
```

## JSON Column Normalization Workflow (v1.26.0)

### Dual-Write During Deprecation Phase
```
API Write Request (e.g., POST /custom-attributes, POST /eco/{id}/items)
  → Write to legacy JSON column (backward compatibility)
    → Write to new normalized table(s) (primary storage going forward)
      → Commit transaction
        → Legacy reads: Return legacy JSON column (unchanged)
        → Normalized reads: Return from normalized tables with hybrid properties
```

### Migration Data Flow
```
Alembic upgrade head (migration 024)
  → Create 4 normalized tables with FK + CASCADE
    → Parse each legacy JSON column:
      → revisions.bomSnapshot:
        → json_array_elements → INSERT INTO revision_bom_snapshot_items
      → custom_attribute_definitions.options:
        → json_array_elements → INSERT INTO custom_attribute_options
      → custom_attribute_definitions.validation_rules:
        → json_each_text → INSERT INTO custom_attribute_validation_rules
      → eco_items.old_value / eco_items.new_value:
        → json_each_text → INSERT INTO eco_item_attribute_changes
    → Add deprecation comments on all 6 legacy columns
```

### Rollback Flow
```
Alembic downgrade 023
  → DROP TABLE eco_item_attribute_changes
    → DROP TABLE custom_attribute_validation_rules
      → DROP TABLE custom_attribute_options
        → DROP TABLE revision_bom_snapshot_items
          → Remove deprecation comments from 6 legacy columns
```

## Screen Data Bridge Flow (v1.47.0)

```
Frontend component needs data (e.g., parts list):
  → Calls dataService.refreshParts()
    → dataService delegates to screenDataBridge.getParts()
      → screenDataBridge calls window.api.partsAPI.list()
        → Success: Returns API response with parts data
        → Failure: Falls back to localStorage.getItem('__bbox_parts')
          → If localStorage has data: Returns cached parts
          → If no localStorage data: Returns empty array
    → Data loaded into AppCtx state
    → Screen re-renders with live/fallback data
```

### Screen Data Bridge — Data Domains
```
screenDataBridge:
  .getParts() / .savePart() / .deletePart()
  .getVendors() / .saveVendor()
  .getProjects() / .saveProject()
  .getProcurement() / .savePO()
  .getDocuments() / .uploadDocument()
  .getUsers() / .saveUser()
  .getNotifications()
  .getComments()
  .getApprovals() / .approve() / .reject()
  .getWorkOrders() / .saveWorkOrder()
  .getTemplates() / .saveTemplate()
  .getEcr() / .saveEcr()
  .getCalendarEvents() / .saveCalendarEvent()
  .getInventory()
  .getQuality()
  .getCompliance()
  .getAnalytics()
  .getMakeVsBuy()
  .getShouldCost()
  .getSupplierScorecard()
  .getCapa()
  .getFai()
  .getDeviations()
  .getKanban()
  .getContracts()
  .getOrderTracking()
  .getWebhooks()
  .getErpConnectors()
  .getSupplierPortal()
  .getTraceability()
  .getSavedSearches()
  .getUserData()
  → Each method: window.api.* → localStorage fallback → empty default
```

### CI/CD Pipeline Flow (v1.47.0)

```
Push to main branch:
  → GitHub Actions CI workflow triggers
    → npx eslint . (frontend lint)
    → npx tsc --noEmit (TypeScript check)
    → npx vitest run (frontend tests)
    → npx vite build (production build)
    → cd backend && ruff check app/ (backend lint)
    → cd backend && python -m pytest app/tests/ -v (backend tests)
  → CI passes: Status check green
  → NO production deployment triggered (main branch deploys disabled)

Push version tag v1.47.0:
  → GitHub Actions CI workflow triggers (same as above)
    → CI passes
  → Production deployment workflow triggers
    → Build Docker images
    → Push to container registry
    → Deploy to production environment
    → Smoke tests against production
```

### Migration 028 — ON DELETE CASCADE Flow (v1.47.0)

```
alembic upgrade head (migration 028_fk_on_delete_cascade.py):
  → For each of 51 FK constraints across tables from migrations 001-004:
    → ALTER TABLE {table} DROP CONSTRAINT {existing_fk}
    → ALTER TABLE {table} ADD CONSTRAINT {fk_name} FOREIGN KEY ({col})
      REFERENCES {parent_table}({id}) ON DELETE CASCADE
  → All constraints verified: 51/51 cascading deletes active

Migration 022 fix — Explicit CREATE TABLE:
  → Replaced Base.metadata.create_all() with 9 explicit statements:
    → op.execute('CREATE TABLE IF NOT EXISTS approvals (... )')
    → op.execute('CREATE TABLE IF NOT EXISTS revisions (... )')
    → op.execute('CREATE TABLE IF NOT EXISTS revision_bom_snapshot_items (... )')
    → op.execute('CREATE TABLE IF NOT EXISTS boms (... )')
    → op.execute('CREATE TABLE IF NOT EXISTS part_vendors (... )')
    → op.execute('CREATE TABLE IF NOT EXISTS po_line_items (... )')
    → op.execute('CREATE TABLE IF NOT EXISTS user_data_store (... )')
    → op.execute('CREATE TABLE IF NOT EXISTS user_preferences (... )')
    → op.execute('CREATE TABLE IF NOT EXISTS part_custom_fields (... )')
```

### BBF Branding Applied (v1.47.0)

```
index.html:
  → <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  → <title> << Blackbox Factories BOM</title>
  → <meta name="author" content="Blackbox Factories">

styles.css:
  → :root { --font-family: 'Montserrat', sans-serif; }
  → --bbf-navy: #001F3F; --bbf-orange: #FF6B35;
  → --bbf-light: #F5F5F5; --bbf-white: #FFFFFF; --bbf-dark: #333333;
  → Updated --accent to use BBF orange (#FF6B35)

TopBar.jsx:
  → Shows: "<< Blackbox Factories BOM"
  → Montserrat font via font-family: 'Montserrat', sans-serif
  → Navy background (#001F3F) with white text

/// Heading convention:
  → All document headings use /// prefix (e.g., "/// System Overview")
```

## CSP Hardening Flow (v1.25.0)
```
Content-Security-Policy:
  script-src 'self' 'unsafe-inline';
    → 'unsafe-eval' REMOVED (was allowing arbitrary JS execution)
    → 'unsafe-inline' retained for React/Babel compatibility
    → report-uri /api/v1/csp-report for violation monitoring
```

## Security Hardening Flow (v1.10.0)

### Request Security Pipeline (Updated)
```
Client Request
  → nginx: Security headers applied (HSTS, CSP, nosniff, X-Frame-Options)
    → nginx: Rate limiting with proper X-Forwarded-For detection
      → Backend: CSRF validation (httponly cookie, secure in production)
        → Backend: JWT validation (30min expiry, was 8 days)
          → Backend: Input sanitization (control chars only, no HTML-escape)
            → Backend: SQL injection prevention (identifier validation)
              → Backend: Role-based access control
                → Response
```

### Startup Health Check Flow
```
Application Start
       │
       ▼
┌──────────────────────────────┐
│  FastAPI lifespan starts     │
│  ┌────────────────────────┐  │
│  │ init_engine()          │  │
│  │ create_all()           │  │
│  │ tenant_events setup    │  │
│  └────────────────────────┘  │
│              │               │
│              ▼               │
│  ┌────────────────────────┐  │
│  │ check_database():      │  │
│  │  • Connectivity test   │  │
│  │  • Table count         │  │
│  │  • WAL level (replica) │  │
│  │  • Archive mode (on)   │  │
│  │  • FK constraints      │  │
│  │  • Index count         │  │
│  └────────────────────────┘  │
│              │               │
│              ▼               │
│  ┌────────────────────────┐  │
│  │ check_backup_system(): │  │
│  │  • Dir exists?         │  │
│  │  • File count ≥ 1?     │  │
│  │  • WAL archive dir     │  │
│  └────────────────────────┘  │
│              │               │
│              ▼               │
│  Log health status           │
│  (HEALTHY / DEGRADED)        │
└──────────────────────────────┘
       │
       ▼
  API ready on :8000
  GET /health available
```

### Monitoring Healthcheck Flow
```
Load Balancer / K8s
       │
       ▼
  GET /health
       │
       ▼
  ┌─────────────────────┐
  │ check_database()    │  ← async, ~500ms
  │ check_backup_system()│  ← async, ~50ms
  └─────────────────────┘
       │
       ▼
  Response: {status, database, backup, checks}
    healthy:   200 + {"status": "healthy"}
    degraded:  200 + {"status": "degraded"}
```

### Backup Credential Flow (Fixed)
```
Before (v1.9.0):
  os.environ["PGPASSWORD"] = DB_PASSWORD  ← Leaked to /proc/PID/environ
  → subprocess.run(cmd)  ← Inherited leaked env

After (v1.10.0):
  env = os.environ.copy()
  env["PGPASSWORD"] = DB_PASSWORD
  → subprocess.run(cmd, env=env)  ← Isolated, no leak
```

## Physical Backup Flow (v1.21.0)

### pg_basebackup Orchestration
```
Client Request → POST /api/v1/backup/physical
  → Endpoint validates superuser permissions
    → create_physical_backup() acquires Redis lock (prevents concurrent backups)
      → _find_pg_basebackup() locates pg_basebackup binary
        → subprocess: pg_basebackup -Ft -z -X stream -D temp_dir/
          → Captures full cluster state (all DBs, transaction IDs, WAL position)
            → Compression: tar format + gzip (built-in -z flag)
              → Encryption: GPG encrypts output file
                → S3 upload: Stores encrypted backup to configured bucket
                  → Backup history recorded in database (type, size, checksum, timestamp)
                    → Lock released
                      → Response: {status: "completed", backup_id, type: "physical", size, path}
```

### Pipeline with Physical Backup
```
POST /api/v1/backup/pipeline?include_physical=true
  → Acquire pipeline lock
    → Phase 1: Logical backup (pg_dump) ← existing flow
      → Stores logical backup
    → Phase 2: Physical backup (pg_basebackup) ← new
      → Stores physical backup
    → Release pipeline lock
      → Response includes both backup_ids
```

## Multi-Tenancy SELECT Isolation Flow (v1.21.0)

### ORM Query Interception
```
Application Request → Auth Middleware
  → Extracts tenantId from JWT/API key
    → Sets contextvars TenantContext(tenant_id=...)
      → ORM SELECT query executes on TenantAwareMixin model
        → do_orm_execute event fires
          → Listener checks: Is model a TenantAwareMixin subclass?
            → YES: Is current user a superuser (tenantId is None)?
              → YES: Bypass filter (no WHERE clause added)
              → NO: Inject WHERE tenantId = :current_tenant
                → Query executes with tenant isolation
            → NO: Query passes through unchanged
```

### Example
```
Before (v1.20.0):
  User A (tenant=1) queries Parts → SELECT * FROM parts  ← Returns ALL tenants' data
  User B (tenant=2) queries Parts → SELECT * FROM parts  ← Returns ALL tenants' data

After (v1.21.0):
  User A (tenant=1) queries Parts → SELECT * FROM parts WHERE tenantId = 1  ← Tenant-isolated
  User B (tenant=2) queries Parts → SELECT * FROM parts WHERE tenantId = 2  ← Tenant-isolated
  Superuser (tenant=NULL) queries Parts → SELECT * FROM parts  ← All tenants visible
```

## Polymorphic FK Enforcement Flow (v1.21.0)

### ORM Validation on Insert/Update
```
Model.insert() or Model.update() called
  → before_insert / before_update ORM event fires
    → Check entityType field exists on model
      → YES: Is entityType in model.ALLOWED_ENTITY_TYPES?
        → YES: Allow operation to proceed
        → NO: Raise ValueError(f"Invalid entityType: {value}")
      → NO: Check reference_type field
        → Is reference_type in model.ALLOWED_REFERENCE_TYPES?
          → YES: Proceed
          → NO: Raise ValueError
    → Composite index updated on (entityType, entityId)
      → Query performance optimized for polymorphic lookups
```

### Example
```
Valid:   AuditLog(entityType="part", entityId=123) → INSERT succeeds
Invalid: AuditLog(entityType="invalid_type", entityId=123) → ValueError raised
Valid:   Notification(reference_type="bom", reference_id=456) → INSERT succeeds
Invalid: Notification(reference_type="bogus_ref", reference_id=456) → ValueError raised
```

## Inline Style Migration Flow (v1.21.0)

### Batch Conversion Script
```
scripts/convert_inline_styles.py --path BOM and PRD/modals-extra.jsx
  → Parse JSX file AST
    → Find all style={{...}} objects
      → For each object:
        → Check ALL property keys have utility class equivalents (map: {flex → "flex", cursor: "pointer" → "cursor-pointer", ...})
          → ALL match: Convert to className="class1 class2"
          → ANY mismatch: Skip entire style object (preserves as-is)
        → If existing className present: Merge (className="old new")
      → Write modified file
    → Report: N converted, M skipped, K remaining
```

### CSS Utility Classes Added (v1.21.0)
```
.d-none, .op-03/05/06/08, .flex-shrink-0/1, .flex-grow-0/1,
.min-w-0/100/200, .max-w-100/200/300/400/500/600,
.overflow-x-a/y-a/vis, .lh-1/1.2/1.4, .text-decoration-none,
.underline, .line-through, .letter-sp-1/2/4/6/8,
.capitalize, .lowercase, .table-auto/fixed,
.bg-elev/sunk/canvas/accent/danger/ok/warn,
.absolute/fixed, .d-block, .mx-auto
+ additional padding/margin variants
```

## v1.46.0 — React Router Migration

### Route Resolution Flow
```
User navigates to /parts
  → React Router <Routes> matches <Route path="/parts">
    → Renders <PartsScreenWrapper/>
      → PartsScreenWrapper reads ctx from AppContext
        → Extracts openModal and onOpenDetail props
          → Renders <ErrBD><PartsScreen openModal={...} onOpenDetail={...}/></ErrBD>

User navigates to /inventory
  → React Router matches <Route path="/inventory">
    → Renders <GenericScreen Component={InventoryScreen}/>
      → GenericScreen renders <ErrBD><InventoryScreen/></ErrBD>

User navigates to /nonexistent
  → React Router matches <Route path="*">
    → Renders <FourOhFour/>
      → Shows ErrorScreen with "Go to Dashboard" action
```

### Backward Compatibility Flow
```
AppShell renders:
  → useLocation() reads pathname from React Router context
  → Derives route = pathname === '/' ? 'dashboard' : pathname.slice(1)
  → Passes route to useKeyboardShortcuts({ route, ... })
  → NavRail uses route to highlight active nav item
  → findNav(route) resolves nav group for screen label
```

### Before vs After
```
Before (v1.45.0):
  const route = window.location.pathname.slice(1) || "dashboard";
  {route === "dashboard" && <DashboardScreen/>}
  {route === "bom" && <BomShell ...props.../>}
  {route === "parts" && <PartsScreen ...props.../>}
  ...36 conditional checks → React reconciliation warnings on every nav

After (v1.46.0):
  const { pathname } = useLocation();
  const route = pathname === '/' ? 'dashboard' : pathname.slice(1);
  <Routes>
    <Route path="/" element={<DashboardWrapper/>}/>
    <Route path="/dashboard" element={<DashboardWrapper/>}/>
    <Route path="/bom" element={<BomShellWrapper/>}/>
    <Route path="/parts" element={<PartsScreenWrapper/>}/>
    ...
    <Route path="*" element={<FourOhFour/>}/>
  </Routes>
  → React Router handles component mounting/unmounting
  → No reconciliation warnings
  → Proper 404 handling
```

## v1.37.0 — API Completeness & Modal Extraction

### PATCH Endpoint Pattern
```
PATCH /{resource}/{id} (27 endpoints across 22 files):
  → Depends(get_current_user) → Validate permissions
  → Read existing record from DB
  → Apply partial updates using model_dump(exclude_unset=True)
  → Delegate to existing PUT handler for shared logic
  → Return updated record
  → Audit log the change (who, what, old/new values)
```

### Bulk DELETE Pattern
```
POST /{resource}/bulk-delete with { ids: [...] }:
  → Depends(get_current_user) → Validate permissions + tenant scoping
  → DELETE FROM {table} WHERE id IN (:ids) AND tenantId = :tenant
  → Return { deleted_count: N }
  → Audit log the bulk operation
```

### Vendors.py Workflow Fix
```
PUT /vendors/{vendor_id} (was empty stub):
  → Query vendor by id + tenantId
  → Validate uniqueness on vendorCode
  → Update row, commit, return updated vendor

PATCH /vendors/{vendor_id} (was dead code):
  → Read existing, apply partial updates, delegate to PUT handler
  → No longer references non-existent vendor_service module
```

### Frontend Modal & Screen Component Extraction
```
src/root/modals-extra.jsx (2361 lines — was monolithic):
  → 17 modal components extracted to src/components/modals/*.jsx
  → index.jsx re-export hub created (handles mixed default/named exports)
  → modals-extra.jsx reduced to backward-compat shim (151 lines):
      · Imports components from src/components/modals/index.jsx
      · Assigns to window.* for runtime access
      · Keeps 2 internal-only modals inline (AuditLogModal, APIKeysModal)
      · Re-exports all 19 symbols for import compatibility
  → globals.js import changed: ./root/modals-extra.jsx → ./components/modals/index.jsx
  → Build output: modals split into separate chunk (181 kB)

src/root/secondary-screens.jsx (1760 lines — was monolithic):
  → 7 screen components extracted to src/components/screens/*.jsx
  → index.jsx re-export hub created
  → secondary-screens.jsx reduced to backward-compat shim (11 lines):
       · Imports from src/components/screens/index.jsx
       · Assigns to window.* for runtime access
   → No globals.js change needed (only imported as side-effect in main.jsx)
```

### User Data Sync Flow (v1.44.0)
```
Frontend screen updates user data
  → Option A (legacy): localStorage.setItem(key, value)
    → Data persists only in browser — LOST on cache clear
  → Option B (new): userDataSyncAPI.upsertDataStore(key, value)
    → apiRequest() → PUT /api/v1/user-sync/data-store/{key}
      → user_sync.py handler: INSERT ... ON CONFLICT DO UPDATE
        → PostgreSQL user_data_store table
          → Data persists in DB — survives cache clear
    → Return: { data_key, data_value, data_version }
```

### Calendar Event Lifecycle (v1.44.0)
```
User creates calendar event:
  → calendarEventsAPI.create({ title, start_time, end_time, event_type, ... })
    → POST /api/v1/calendar/calendar-events
      → calendar_events.py handler:
        → INSERT INTO calendar_events RETURNING *
        → Commit
      → Return: full CalendarEventResponse with id, timestamps
  → User views calendar:
    → calendarEventsAPI.list({ start_date, end_date, event_type })
      → GET /api/v1/calendar/calendar-events?start_date=...&end_date=...
        → calendar_events.py handler:
          → SELECT * FROM calendar_events WHERE user_id=? AND start_time >= ? AND end_time <= ?
          → Return: ordered list of events
```

### API Client Port Resolution (v1.44.0)
```
Frontend makes API call:
  → Previously: API_BASE = 'http://localhost:8002/api/v1' ← WRONG (backend on 8000)
    → Every request to port 8002 → connection refused → all screens show "API unavailable"
  → Fixed: API_BASE = 'http://localhost:8000/api/v1'
    → Requests reach uvicorn on port 8000 → API works
   → Root cause: backend docker-compose.yml maps 8000:8000, frontend api.js hardcoded 8002
```

### Test Database Resolution Flow (v1.45.0)
```
Developer runs pytest (no env vars):
  → conftest.py reads TEST_DATABASE_URL → not set
  → conftest.py checks POSTGRES_SERVER → not set
  → conftest.py checks CI env var → not set
  → FALLBACK: use SQLite + warnings.warn("Set TEST_DATABASE_URL...")
  → Tests run against test.db (SQLite 3.x)
  → Risk: PostgreSQL-specific features (JSONB, FTS, ENUMs) not tested

Developer runs pytest (with PostgreSQL):
  → conftest.py reads TEST_DATABASE_URL → postgresql+asyncpg://...
    → Tests run against real PostgreSQL
  → OR: conftest.py detects POSTGRES_SERVER=localhost or CI=true
    → Auto-constructs URL from POSTGRES_USER/PASSWORD/DB/PORT
    → Tests run against real PostgreSQL

CI pipeline runs:
  → GitHub Actions sets CI=true (always)
  → docker-compose spins up PostgreSQL service container on port 5432
  → conftest.py detects CI=true → sets pg_server="localhost"
    → CI workflow also sets TEST_DATABASE_URL explicitly (belt + suspenders)
  → Tests run against PostgreSQL in CI
  → SQLite fallback never triggered in CI

Local PostgreSQL test setup:
  → docker compose -f backend/docker-compose.test.yml up -d
    → Starts PostgreSQL on port 5433, Redis on port 6380
  → SET TEST_DATABASE_URL=postgresql+asyncpg://bom_user:bom_test_password@localhost:5433/bom_test_db
  → python -m pytest backend/app/tests/ -v
  → Tests run against PostgreSQL locally
```

### analytics.py PostgreSQL-Only (v1.48.0)
- `_is_sqlite()` function removed — SQLite dialect check is dead code
- All queries now use PostgreSQL-only date functions (`TO_CHAR`, `NOW()`)
- SQLite code paths used `strftime()` and `datetime('now')` — removed

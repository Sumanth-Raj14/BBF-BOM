# System Workflows

## Security Hardening Flows (v1.3.0)

### JWT Algorithm Verification
```
verify_token(token):
  → jwt.get_unverified_header(token) → Extract "alg" claim
  → Match against configured algorithm (RS256)
  → Mismatch → Reject (prevents algorithm confusion attacks)
```

### IP Rate Limiting
```
Login attempt from IP:
  → _check_ip_rate_limit(ip, "login")
  → < 10 attempts/min → Allow (then check credentials)
  → >= 10 attempts/min → 429 Too Many Requests
  → Account lockout (5 failed) only reached after IP throttle
```

### WebSocket Tenant Isolation
```
Connect → Extract tenantId from JWT → Subscribe to scoped_channel
Broadcast → Publish to scoped_channel (prevents cross-tenant leakage)
Disconnect → Remove scoped_channel subscription
```

### CORS Hardening
```
Allowed methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Allowed headers: Content-Type, Authorization, X-API-Key, X-CSRF-Token,
                 X-Requested-With, Accept, Origin, Referer
```

### Sanitization Pipeline (v1.3.0)
```
JSON body → Walk tree → String values: strip XSS patterns (not html.escape)
Form data → URL-decode → sanitize → re-encode
Parse failure → Log warning (no longer silently bypassed)
```

## Authentication Flow
```
Client → POST /auth/login → Validate credentials → Generate JWT → Return tokens
Client → POST /auth/register → Validate input → Hash password → Create user → Return tokens
Client → GET /auth/me → Verify JWT → Return user profile
```

## Multi-Tenant Data Isolation
```
Request → get_current_user → Extract tenantId from JWT (now guaranteed present)
       → Set TenantContext (thread-local)
       → INSERT → before_insert listener auto-populates tenantId
       → SELECT/UPDATE/DELETE → do_orm_execute listener auto-adds WHERE tenantId = ?
       → Response
```
**Note**: v1.2.0 fixed JWT `tenantId` claim (was previously always `None`). `get_users()` and `get_user(id)` now properly scope to tenant.

## BOM Template Lifecycle
```
Create Template → POST /bom-templates/ → Store JSON bomData + create BomItem rows
Load Template → POST /bom-templates/{id}/load → Return items with computed costs
Update Template → PUT /bom-templates/{id} → Modify fields
Delete Template → DELETE /bom-templates/{id} → Cascade delete BomItems
```

## Purchase Order Workflow
```
Create PO → POST /procurement/ → Create POHeader + POLineItem
List POs → GET /po-orders → Paginated list with stats
View Detail → GET /po-orders/{id} → Header + line items
Track Status → GET /po-orders/stats → Aggregate metrics
```

## Supplier Portal
```
Register → POST /supplier-portal/users → Create supplier user account
Login → POST /supplier-portal/login → Generate session token
Submit Price → POST /supplier-portal/price-updates → Submit with token
Approve/Reject → PUT /supplier-portal/price-updates/{id}/approve|reject
```

## Kanban Inventory
```
Create Trigger → POST /kanban/ → Set min/max/safety stock → Auto-calculate status
Update Stock → POST /kanban/{id}/update-stock → Adjust current stock
Low Stock Alert → GET /kanban/alerts/low-stock → Items with Low/Critical status
```

## Approval Automation
```
Create Rule → POST /approval-automation/rules → Define conditions + action
Evaluate → System checks rules on PO creation → Auto-approve if conditions match
Update Rule → PUT /approval-automation/rules/{id} → Modify conditions
```

## Webhook Delivery
```
Subscribe → POST /webhooks → Register URL + events
Trigger → System event → Match subscriptions → Dispatch HTTP POST
Track → GET /webhooks/deliveries → View delivery history
```

## Audit Logging (v1.2.0)
```
Request → AuditLogMiddleware → Create audit task (fire-and-forget)
       → Track in _pending_audit_tasks set
       → Task completes → Remove from set
       → App shutdown → await _pending_audit_tasks drain → All entries persisted
```

## Backup & Restore
```
Backup → POST /api/v1/backup/ → pg_dump → Store backup file + metadata
Restore → POST /api/v1/backup/restore/{id} → HTTP restore endpoint
Verify → GET /backups/ → List with sizes, timestamps
```
**Note**: v1.2.0 added disk space check before backup, Linux pg_dump paths.

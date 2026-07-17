# Module Reference

## Backend Structure

### app/core/ — Core Infrastructure
| File | Purpose |
|------|---------|
| `config.py` | Application settings from env vars |
| `security.py` | Password hashing (bcrypt), JWT encode/decode (with tenantId) |
| `deps.py` | FastAPI dependencies: get_current_user, pagination, API key prefix auth |
| `rbac.py` | Role-based access control decorators/deps |
| `csrf.py` | CSRF double-submit cookie middleware |
| `sanitize.py` | HTML entity encoding for XSS prevention (JSON + form data) |
| `audit_middleware.py` | Request audit logging (fire-and-forget with shutdown drain) |
| `cache.py` | Token blacklist with DB fallback |
| `tenant_context.py` | Thread-local tenant ID context |
| `tenant_events.py` | SQLAlchemy event listeners for tenant isolation |
| `pagination.py` | Paginated response helper |
| `compress.py` | Response compression middleware |
| `security_headers.py` | HTTP security headers middleware |
| `session_timeout.py` | Session timeout enforcement |
| `totp_encryption.py` | Fernet/AES encryption for TOTP secrets (v1.1.0) |
| `encryption.py` | SHA256-based key derivation for Fernet (v1.2.0) |
| `rate_limit.py` | Redis-backed distributed rate limiter |
| `s3_storage.py` | S3 file storage with aiobotocore (client lifecycle fixed v1.2.0) |

### app/models/ — Database Models (85+ tables)
| Model File | Tables |
|------------|--------|
| `user.py` | users |
| `tenant.py` | tenants |
| `part.py` | parts |
| `part_country_history.py` | part_country_history, part_vendor_prices |
| `bom_template.py` | bom_templates |
| `bom_item.py` | bom_items |
| `vendor.py` | vendors |
| `po_models.py` | po_headers, po_line_items |
| `kanban.py` | kanban_triggers |
| `approval.py` | approvals |
| `capa.py` | capas, capa_attachments |
| `fai.py` | fai_reports, fai_characteristics |
| `deviation.py` | deviations, deviation_lots |
| `contract.py` | contracts, contract_parts, pricing_agreements |
| `supplier_portal.py` | supplier_users, supplier_price_updates |
| `webhook.py` | webhook_subscriptions, webhook_deliveries |
| `resource_scheduling.py` | work_centers, resource_schedules, capacity_reports |
| `token_blacklist.py` | token_blacklist |
| `mixins.py` | TenantAwareMixin base class |

### app/api/endpoints/ — API Routes (50+ files)
| Endpoint | Prefix | Key Routes |
|----------|--------|------------|
| `auth.py` | /auth | login, register, refresh, me, mfa |
| `parts.py` | /parts | CRUD + list |
| `bom_templates.py` | /bom-templates | CRUD + load |
| `bom_items.py` | /bom-items | CRUD |
| `vendors.py` | /vendors | CRUD |
| `procurement.py` | /procurement | CRUD PO workflow |
| `po_orders.py` | /po-orders | List, detail, stats |
| `kanban.py` | /kanban | CRUD triggers, stock alerts |
| `supplier_portal.py` | /supplier-portal | Users, login, price updates |
| `approval_automation.py` | /approval-automation | Rules CRUD |
| `webhooks.py` | /webhooks | Subscribe, deliver |
| `documents.py` | /documents | Upload, download |
| `bulk_import.py` | /import | Upload, process, errors |
| `erp_connectors.py` | /erp-connectors | Sync connectors |
| `country_history.py` | /country-history | Part country history |
| `ai_features.py` | /ai | Forecast, suggestions |
| `contract.py` | /contracts | CRUD |
| `supplier_scorecard.py` | /supplier-scorecard | CRUD |
| `notifications.py` | /notifications | User notifications |
| `comments.py` | /comments | CRUD |
| `traceability.py` | /traceability | Serial numbers, lots |
| `revisions.py` | /revisions | Version snapshots |

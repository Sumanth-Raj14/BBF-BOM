# Feature Catalog

## Core BOM Management
- **Parts Management** — CRUD for parts with categories, UOM, custom fields
- **BOM Templates** — Create, load, and manage BOM templates with itemized components
- **BOM Items** — Line items linking templates to parts with quantities, reference designators
- **Revisions** — Version tracking for BOM and parts with snapshot history
- **Projects** — Project-based organization of BOM data
- **Vendors** — Supplier management with reliability ratings

## Procurement & Supply Chain
- **Purchase Orders** — PO creation, line items, status tracking
- **Procurement** — End-to-end procurement workflow with part/vendor linking
- **Supplier Portal** — Supplier user management, price update submissions/approvals
- **Supplier Scorecard** — Vendor performance metrics and scoring
- **Contract Management** — Contracts, pricing agreements, contract-parts mapping
- **Price History** — Track price changes over time

## Quality & Compliance
- **CAPA** — Corrective and Preventive Actions with attachments
- **Deviation** — Deviation management with lot tracking
- **FAI** — First Article Inspection reports and characteristics
- **Compliance** — Compliance tracking and documentation

## Manufacturing & Operations
- **Kanban** — Kanban trigger management, stock alerts, inventory replenishment
- **Make vs Buy** — Analysis framework for build vs purchase decisions
- **Should Cost** — Cost modeling and analysis
- **Work Centers** — Capacity planning and resource scheduling

## Engineering & Design
- **SolidWorks Integration** — CAD model extraction, image capture, real-time sync
- **3D Viewer** — Three.js-based model viewer (STL, OBJ, GLTF, STEP)
- **ECO** — Engineering Change Order management with approval workflow
- **Country History** — Part country of origin tracking via PartCountryHistory

## Integration & Automation
- **Approval Automation** — Rule-based auto-approval for POs and changes
- **ERP Connectors** — Integration with external ERP systems
- **Bulk Import** — CSV/Excel import with mapping configuration
- **Webhooks** — Event-driven webhook subscriptions and deliveries
- **AI Features** — Demand forecasting, interchangeability suggestions

## Disaster Recovery & Backup
- **Automated Backups** — pg_dump-based with disk space checks
- **HTTP Restore** — POST endpoint for backup restoration
- **Backup History** — Metadata tracking, listing, scheduling
- **Shutdown Drain** — Pending audit tasks flushed on app shutdown

## Security & Administration
- **Authentication** — JWT-based auth (with tenantId claim), MFA, session management
- **RBAC** — Role-based access control with granular permissions
- **Multi-tenant** — Tenant isolation via TenantAwareMixin, event listeners, and JWT tenantId claim
- **Audit Logging** — Comprehensive audit trail for all mutating operations (fire-and-forget with shutdown drain)
- **CSRF Protection** — Double-submit cookie pattern
- **Rate Limiting** — Redis-backed distributed rate limiting (with in-memory fallback)
- **Input Sanitization** — XSS prevention via HTML entity encoding (covers JSON + form data)
- **JWT Algorithm Verification** — `get_unverified_header()` check prevents algorithm confusion (v1.3.0)
- **IP Rate Limiting** — Per-IP throttling before account lockout (v1.3.0)
- **RSA Key Encryption** — Private key encrypted at rest with `BestAvailableEncryption` (v1.3.0)
- **CORS Hardening** — Explicit method/header whitelist, no wildcards (v1.3.0)
- **WebSocket Tenant Scoping** — Broadcast/disconnect use scoped channels (v1.3.0)
- **Sanitization Pipeline** — XSS pattern stripping, parse failure logging (v1.3.0)
- **SSO Callback Rate Limiting** — 10/minute on SAML/OAuth callback (v1.3.0)
- **SAML Debug Disabled** — Debug mode hardened across all environments (v1.3.0)
- **Metrics Authentication** — `/metrics` endpoint requires JWT (v1.3.0)
- **API Key Prefix** — Actual prefix stored for indexed lookup (v1.3.0)
- **Database Model Fixes** — TokenBlacklist.tenantId, FK cascades, new indexes across 4 models (v1.3.0)

## Infrastructure & Operations
- **Docker Compose** — Production stack: PostgreSQL 16, Redis, PgBouncer, MinIO, Celery, pgBackRest, nginx
- **Multi-stage Build** — Production Dockerfile with 4 workers, health checks, resource limits
- **S3 Storage** — Document/file storage with aiobotocore (fixed client lifecycle in v1.2.0)

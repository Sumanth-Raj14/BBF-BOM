"""Formalize the create_all-only tables into the Alembic chain.

Closes the gap that let `calendar_events` ship broken (fixed in 058): a table
that exists only because `Base.metadata.create_all()` made it is absent from
any database that took the incremental `alembic upgrade head` path, so every
endpoint touching it 500s while CI stays green.

Migration 022 claimed in its docstring to formalize "~73 tables previously
created only via Base.metadata.create_all()". It actually creates nine. This
migration creates the remaining 74, including the tables behind live features:
RBAC (roles, permissions, user_roles, role_permissions), inventory, ECO and PO.

Why raw DDL instead of op.create_table(): this matches the existing convention
in 022, and the statements are a FROZEN snapshot compiled from the models at
this revision — a migration that iterated Base.metadata at run time would
retroactively change its own meaning every time a model changed.

Every statement is IF NOT EXISTS. Existing databases (all of which were
bootstrapped by scripts.init_db's greenfield create_all branch, so they already
have these tables) upgrade to a no-op; a migrate-only deployment finally gets a
complete schema. Ordered by FK dependency.

NOTE: this does not make the chain buildable from base — migrations 004-021
still reference tables before this point. scripts.init_db remains the supported
bootstrap for a greenfield database. This migration exists so that an
already-managed database is not missing tables.

Revision ID: 059_formalize_create_all_tables
Revises: 058_calendar_events
"""

from collections.abc import Sequence

from alembic import op

revision: str = "059_formalize_create_all_tables"
down_revision: str | None = "058_calendar_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # tenants
    op.execute("""
CREATE TABLE IF NOT EXISTS tenants (
	id SERIAL NOT NULL, 
	tenant_name VARCHAR(255) NOT NULL, 
	tenant_code VARCHAR(50) NOT NULL, 
	domain VARCHAR(255), 
	plan VARCHAR(50), 
	status VARCHAR(50), 
	settings JSON, 
	max_users INTEGER, 
	max_storage_gb INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	CONSTRAINT pk_tenants PRIMARY KEY (id), 
	CONSTRAINT ck_tenants_ck_tenants_status CHECK (status IN ('active', 'inactive', 'suspended')), 
	CONSTRAINT ck_tenants_ck_tenants_plan CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')), 
	CONSTRAINT uq_tenants_tenant_code UNIQUE (tenant_code), 
	CONSTRAINT uq_tenants_domain UNIQUE (domain)
)
    """)

    # approval_automation_rules
    op.execute("""
CREATE TABLE IF NOT EXISTS approval_automation_rules (
	id SERIAL NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	conditions JSON, 
	actions JSON, 
	active BOOLEAN, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_approval_automation_rules PRIMARY KEY (id), 
	CONSTRAINT "fk_approval_automation_rules_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # approval_automation_rules:ix_approval_automation_rules_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_approval_automation_rules_tenantId" ON approval_automation_rules ("tenantId")
    """)

    # auto_number_schemes
    op.execute("""
CREATE TABLE IF NOT EXISTS auto_number_schemes (
	id SERIAL NOT NULL, 
	entity_type VARCHAR(50) NOT NULL, 
	prefix VARCHAR(20) NOT NULL, 
	separator VARCHAR(5), 
	next_number INTEGER, 
	padding INTEGER, 
	suffix VARCHAR(20), 
	format_example VARCHAR(100), 
	is_active BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_auto_number_schemes PRIMARY KEY (id), 
	CONSTRAINT "fk_auto_number_schemes_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # auto_number_schemes:ix_auto_number_schemes_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_auto_number_schemes_tenantId" ON auto_number_schemes ("tenantId")
    """)

    # compliance
    op.execute("""
CREATE TABLE IF NOT EXISTS compliance (
	id SERIAL NOT NULL, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	"isActive" BOOLEAN, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_compliance PRIMARY KEY (id), 
	CONSTRAINT uq_compliance_tenant_name UNIQUE ("tenantId", name), 
	CONSTRAINT "fk_compliance_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # compliance:ix_compliance_name
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_compliance_name ON compliance (name)
    """)

    # compliance:ix_compliance_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_compliance_tenantId" ON compliance ("tenantId")
    """)

    # currencies
    op.execute("""
CREATE TABLE IF NOT EXISTS currencies (
	id SERIAL NOT NULL, 
	code VARCHAR(3) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	symbol VARCHAR(10), 
	is_active BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_currencies PRIMARY KEY (id), 
	CONSTRAINT uq_currencies_tenant_code UNIQUE ("tenantId", code), 
	CONSTRAINT "fk_currencies_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # currencies:ix_currencies_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_currencies_tenantId" ON currencies ("tenantId")
    """)

    # custom_attribute_definitions
    op.execute("""
CREATE TABLE IF NOT EXISTS custom_attribute_definitions (
	id SERIAL NOT NULL, 
	entity_type VARCHAR(50) NOT NULL, 
	attribute_name VARCHAR(100) NOT NULL, 
	display_name VARCHAR(255), 
	attribute_type VARCHAR(50) NOT NULL, 
	is_required BOOLEAN, 
	is_searchable BOOLEAN, 
	default_value TEXT, 
	options JSON, 
	validation_rules JSON, 
	sort_order INTEGER, 
	is_active BOOLEAN, 
	formula TEXT, 
	is_computed BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_custom_attribute_definitions PRIMARY KEY (id), 
	CONSTRAINT "fk_custom_attribute_definitions_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # custom_attribute_definitions:ix_custom_attribute_definitions_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_custom_attribute_definitions_tenantId" ON custom_attribute_definitions ("tenantId")
    """)

    # exchange_rates
    op.execute("""
CREATE TABLE IF NOT EXISTS exchange_rates (
	id SERIAL NOT NULL, 
	from_currency VARCHAR(3) NOT NULL, 
	to_currency VARCHAR(3) NOT NULL, 
	rate NUMERIC(12, 6) NOT NULL, 
	effective_date TIMESTAMP WITH TIME ZONE NOT NULL, 
	source VARCHAR(100), 
	is_active BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_exchange_rates PRIMARY KEY (id), 
	CONSTRAINT "fk_exchange_rates_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # exchange_rates:ix_exchange_rates_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_exchange_rates_tenantId" ON exchange_rates ("tenantId")
    """)

    # labor_rates
    op.execute("""
CREATE TABLE IF NOT EXISTS labor_rates (
	id SERIAL NOT NULL, 
	employee_id VARCHAR(50) NOT NULL, 
	employee_name VARCHAR(255) NOT NULL, 
	skill_level VARCHAR(50), 
	regular_rate NUMERIC(10, 4) NOT NULL, 
	overtime_rate NUMERIC(10, 4), 
	skill_tags JSON, 
	is_active BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_labor_rates PRIMARY KEY (id), 
	CONSTRAINT "fk_labor_rates_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # labor_rates:ix_labor_rates_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_labor_rates_tenantId" ON labor_rates ("tenantId")
    """)

    # lifecycle_definitions
    op.execute("""
CREATE TABLE IF NOT EXISTS lifecycle_definitions (
	id SERIAL NOT NULL, 
	lifecycle_name VARCHAR(100) NOT NULL, 
	states JSON NOT NULL, 
	transitions JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_lifecycle_definitions PRIMARY KEY (id), 
	CONSTRAINT uq_lifecycle_definitions_tenant_lifecycle_name UNIQUE ("tenantId", lifecycle_name), 
	CONSTRAINT "fk_lifecycle_definitions_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # lifecycle_definitions:ix_lifecycle_definitions_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_lifecycle_definitions_tenantId" ON lifecycle_definitions ("tenantId")
    """)

    # permissions
    op.execute("""
CREATE TABLE IF NOT EXISTS permissions (
	id SERIAL NOT NULL, 
	name VARCHAR NOT NULL, 
	resource VARCHAR, 
	action VARCHAR, 
	description TEXT, 
	"isActive" BOOLEAN, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_permissions PRIMARY KEY (id), 
	CONSTRAINT uq_permissions_tenant_name UNIQUE ("tenantId", name), 
	CONSTRAINT "fk_permissions_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # permissions:ix_permissions_name
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_permissions_name ON permissions (name)
    """)

    # permissions:ix_permissions_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_permissions_tenantId" ON permissions ("tenantId")
    """)

    # roles
    op.execute("""
CREATE TABLE IF NOT EXISTS roles (
	id SERIAL NOT NULL, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	"isActive" BOOLEAN, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_roles PRIMARY KEY (id), 
	CONSTRAINT uq_roles_tenant_name UNIQUE ("tenantId", name), 
	CONSTRAINT "fk_roles_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # roles:ix_roles_name
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_roles_name ON roles (name)
    """)

    # roles:ix_roles_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_roles_tenantId" ON roles ("tenantId")
    """)

    # tags
    op.execute("""
CREATE TABLE IF NOT EXISTS tags (
	id SERIAL NOT NULL, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	"isActive" BOOLEAN, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_tags PRIMARY KEY (id), 
	CONSTRAINT uq_tags_tenant_name UNIQUE ("tenantId", name), 
	CONSTRAINT "fk_tags_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # tags:ix_tags_name
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_tags_name ON tags (name)
    """)

    # tags:ix_tags_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_tags_tenantId" ON tags ("tenantId")
    """)

    # token_blacklist
    op.execute("""
CREATE TABLE IF NOT EXISTS token_blacklist (
	id SERIAL NOT NULL, 
	jti VARCHAR NOT NULL, 
	"expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_token_blacklist PRIMARY KEY (id), 
	CONSTRAINT "fk_token_blacklist_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # token_blacklist:idx_token_blacklist_expires
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist ("expiresAt")
    """)

    # token_blacklist:ix_token_blacklist_jti
    op.execute("""
CREATE UNIQUE INDEX IF NOT EXISTS ix_token_blacklist_jti ON token_blacklist (jti)
    """)

    # token_blacklist:ix_token_blacklist_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_token_blacklist_tenantId" ON token_blacklist ("tenantId")
    """)

    # validation_results
    op.execute("""
CREATE TABLE IF NOT EXISTS validation_results (
	id SERIAL NOT NULL, 
	"entityType" VARCHAR(50), 
	"entityId" INTEGER, 
	result JSON, 
	passed BOOLEAN, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_validation_results PRIMARY KEY (id), 
	CONSTRAINT "fk_validation_results_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # validation_results:idx_validation_entity
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_validation_entity ON validation_results ("entityType", "entityId")
    """)

    # validation_results:ix_validation_results_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_validation_results_tenantId" ON validation_results ("tenantId")
    """)

    # warehouses
    op.execute("""
CREATE TABLE IF NOT EXISTS warehouses (
	id SERIAL NOT NULL, 
	warehouse_code VARCHAR(50) NOT NULL, 
	warehouse_name VARCHAR(255) NOT NULL, 
	address TEXT, 
	is_active BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_warehouses PRIMARY KEY (id), 
	CONSTRAINT uq_warehouses_tenant_warehouse_code UNIQUE ("tenantId", warehouse_code), 
	CONSTRAINT "fk_warehouses_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # warehouses:ix_warehouses_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_warehouses_tenantId" ON warehouses ("tenantId")
    """)

    # work_centers
    op.execute("""
CREATE TABLE IF NOT EXISTS work_centers (
	id SERIAL NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	capacity_per_hour NUMERIC(10, 4), 
	capacity_unit VARCHAR(20), 
	cost_per_hour NUMERIC(10, 4), 
	available_hours_per_day NUMERIC(5, 2), 
	efficiency_rate NUMERIC(5, 2), 
	is_bottleneck BOOLEAN, 
	is_active BOOLEAN, 
	location VARCHAR(255), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_work_centers PRIMARY KEY (id), 
	CONSTRAINT uq_work_centers_tenant_code UNIQUE ("tenantId", code), 
	CONSTRAINT "fk_work_centers_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # work_centers:ix_work_centers_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_work_centers_tenantId" ON work_centers ("tenantId")
    """)

    # api_keys
    op.execute("""
CREATE TABLE IF NOT EXISTS api_keys (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	key_hash VARCHAR(255) NOT NULL, 
	key_prefix VARCHAR(20) NOT NULL, 
	scopes JSON, 
	is_active BOOLEAN, 
	expires_at TIMESTAMP WITH TIME ZONE, 
	last_used_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_api_keys PRIMARY KEY (id), 
	CONSTRAINT fk_api_keys_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_api_keys_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # api_keys:ix_api_keys_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_api_keys_tenantId" ON api_keys ("tenantId")
    """)

    # api_keys:ix_api_keys_user_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_api_keys_user_id ON api_keys (user_id)
    """)

    # bin_locations
    op.execute("""
CREATE TABLE IF NOT EXISTS bin_locations (
	id SERIAL NOT NULL, 
	warehouse_id INTEGER NOT NULL, 
	bin_code VARCHAR(50) NOT NULL, 
	bin_name VARCHAR(255), 
	zone VARCHAR(50), 
	aisle VARCHAR(50), 
	rack VARCHAR(50), 
	shelf VARCHAR(50), 
	bin_position VARCHAR(50), 
	is_active BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_bin_locations PRIMARY KEY (id), 
	CONSTRAINT uq_bin_warehouse UNIQUE (warehouse_id, bin_code), 
	CONSTRAINT fk_bin_locations_warehouse_id_warehouses FOREIGN KEY(warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_bin_locations_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # bin_locations:ix_bin_locations_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_bin_locations_tenantId" ON bin_locations ("tenantId")
    """)

    # bin_locations:ix_bin_locations_warehouse_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bin_locations_warehouse_id ON bin_locations (warehouse_id)
    """)

    # capacity_reports
    op.execute("""
CREATE TABLE IF NOT EXISTS capacity_reports (
	id SERIAL NOT NULL, 
	report_date TIMESTAMP WITH TIME ZONE NOT NULL, 
	work_center_id INTEGER NOT NULL, 
	available_hours NUMERIC(5, 2), 
	planned_hours NUMERIC(5, 2), 
	actual_hours NUMERIC(5, 2), 
	utilization_pct NUMERIC(5, 2), 
	bottleneck_flag BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_capacity_reports PRIMARY KEY (id), 
	CONSTRAINT fk_capacity_reports_work_center_id_work_centers FOREIGN KEY(work_center_id) REFERENCES work_centers (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_capacity_reports_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # capacity_reports:ix_capacity_reports_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_capacity_reports_tenantId" ON capacity_reports ("tenantId")
    """)

    # capacity_reports:ix_capacity_reports_work_center_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_capacity_reports_work_center_id ON capacity_reports (work_center_id)
    """)

    # comments
    op.execute("""
CREATE TABLE IF NOT EXISTS comments (
	id SERIAL NOT NULL, 
	content TEXT NOT NULL, 
	"entityType" VARCHAR, 
	"entityId" INTEGER NOT NULL, 
	"userId" INTEGER NOT NULL, 
	"parentId" INTEGER, 
	mentions TEXT, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_comments PRIMARY KEY (id), 
	CONSTRAINT "fk_comments_userId_users" FOREIGN KEY("userId") REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_comments_parentId_comments" FOREIGN KEY("parentId") REFERENCES comments (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_comments_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # comments:idx_comment_entity
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_comment_entity ON comments ("entityType", "entityId")
    """)

    # comments:ix_comments_parentId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_comments_parentId" ON comments ("parentId")
    """)

    # comments:ix_comments_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_comments_tenantId" ON comments ("tenantId")
    """)

    # comments:ix_comments_userId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_comments_userId" ON comments ("userId")
    """)

    # digital_signatures
    op.execute("""
CREATE TABLE IF NOT EXISTS digital_signatures (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	document_type VARCHAR(50) NOT NULL, 
	document_id INTEGER NOT NULL, 
	signature_type VARCHAR(50) NOT NULL, 
	signature_data TEXT NOT NULL, 
	certificate_info JSON, 
	ip_address VARCHAR(50), 
	user_agent TEXT, 
	signed_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	is_valid BOOLEAN, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_digital_signatures PRIMARY KEY (id), 
	CONSTRAINT ck_digital_signatures_ck_digital_signatures_document_type CHECK (document_type IN ('eco', 'ncr', 'capa', 'contract', 'quality_report', 'fai', 'deviation', 'audit_report')), 
	CONSTRAINT ck_digital_signatures_ck_digital_signatures_signature_type CHECK (signature_type IN ('electronic', 'digital', 'biometric', 'typed')), 
	CONSTRAINT fk_digital_signatures_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_digital_signatures_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # digital_signatures:idx_digital_sig_document
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_digital_sig_document ON digital_signatures (document_type, document_id)
    """)

    # digital_signatures:ix_digital_signatures_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_digital_signatures_tenantId" ON digital_signatures ("tenantId")
    """)

    # digital_signatures:ix_digital_signatures_user_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_digital_signatures_user_id ON digital_signatures (user_id)
    """)

    # eco_headers
    op.execute("""
CREATE TABLE IF NOT EXISTS eco_headers (
	id SERIAL NOT NULL, 
	eco_number VARCHAR(50) NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	description TEXT, 
	reason TEXT, 
	change_type VARCHAR(50) NOT NULL, 
	status VARCHAR(50), 
	priority VARCHAR(50), 
	impact_level VARCHAR(50), 
	requested_by INTEGER, 
	requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	reviewed_by INTEGER, 
	reviewed_at TIMESTAMP WITH TIME ZONE, 
	approved_by INTEGER, 
	approved_at TIMESTAMP WITH TIME ZONE, 
	implemented_by INTEGER, 
	implemented_at TIMESTAMP WITH TIME ZONE, 
	effective_date DATE, 
	target_completion_date DATE, 
	extra_data JSON, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_eco_headers PRIMARY KEY (id), 
	CONSTRAINT uq_eco_headers_tenant_eco_number UNIQUE ("tenantId", eco_number), 
	CONSTRAINT ck_eco_headers_ck_eco_headers_change_type CHECK (change_type IN ('design', 'process', 'supplier', 'quality', 'other')), 
	CONSTRAINT ck_eco_headers_ck_eco_headers_status CHECK (status IN ('draft', 'review', 'approved', 'implemented', 'closed', 'cancelled')), 
	CONSTRAINT ck_eco_headers_ck_eco_headers_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')), 
	CONSTRAINT ck_eco_headers_ck_eco_headers_impact_level CHECK (impact_level IN ('minor', 'major', 'critical')), 
	CONSTRAINT fk_eco_headers_requested_by_users FOREIGN KEY(requested_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_eco_headers_reviewed_by_users FOREIGN KEY(reviewed_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_eco_headers_approved_by_users FOREIGN KEY(approved_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_eco_headers_implemented_by_users FOREIGN KEY(implemented_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_eco_headers_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # eco_headers:idx_eco_headers_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_eco_headers_tenant_status ON eco_headers ("tenantId", status)
    """)

    # eco_headers:ix_eco_headers_approved_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_headers_approved_by ON eco_headers (approved_by)
    """)

    # eco_headers:ix_eco_headers_eco_number
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_headers_eco_number ON eco_headers (eco_number)
    """)

    # eco_headers:ix_eco_headers_implemented_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_headers_implemented_by ON eco_headers (implemented_by)
    """)

    # eco_headers:ix_eco_headers_requested_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_headers_requested_by ON eco_headers (requested_by)
    """)

    # eco_headers:ix_eco_headers_reviewed_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_headers_reviewed_by ON eco_headers (reviewed_by)
    """)

    # eco_headers:ix_eco_headers_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_eco_headers_tenantId" ON eco_headers ("tenantId")
    """)

    # notifications
    op.execute("""
CREATE TABLE IF NOT EXISTS notifications (
	id SERIAL NOT NULL, 
	title VARCHAR NOT NULL, 
	message TEXT NOT NULL, 
	type VARCHAR, 
	status VARCHAR, 
	"entityType" VARCHAR, 
	"entityId" INTEGER, 
	"userId" INTEGER NOT NULL, 
	"actionUrl" VARCHAR, 
	"actionLabel" VARCHAR, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"readAt" TIMESTAMP WITH TIME ZONE, 
	"expiresAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_notifications PRIMARY KEY (id), 
	CONSTRAINT ck_notifications_ck_notifications_type CHECK (type IN ('info', 'warning', 'error', 'success')), 
	CONSTRAINT ck_notifications_ck_notifications_status CHECK (status IN ('unread', 'read', 'archived')), 
	CONSTRAINT "fk_notifications_userId_users" FOREIGN KEY("userId") REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_notifications_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # notifications:idx_notification_entity
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_notification_entity ON notifications ("entityType", "entityId")
    """)

    # notifications:idx_notifications_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications ("tenantId", status)
    """)

    # notifications:ix_notifications_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_notifications_tenantId" ON notifications ("tenantId")
    """)

    # notifications:ix_notifications_userId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_notifications_userId" ON notifications ("userId")
    """)

    # notifications_queue
    op.execute("""
CREATE TABLE IF NOT EXISTS notifications_queue (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	notification_type VARCHAR(50) NOT NULL, 
	subject VARCHAR(255) NOT NULL, 
	body TEXT, 
	channel VARCHAR(50), 
	priority VARCHAR(50), 
	reference_type VARCHAR(50), 
	reference_id INTEGER, 
	is_read BOOLEAN, 
	is_sent BOOLEAN, 
	sent_at TIMESTAMP WITH TIME ZONE, 
	read_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_notifications_queue PRIMARY KEY (id), 
	CONSTRAINT ck_notifications_queue_ck_notification_queue_notification_type CHECK (notification_type IN ('info', 'warning', 'error', 'success', 'alert')), 
	CONSTRAINT ck_notifications_queue_ck_notification_queue_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')), 
	CONSTRAINT ck_notifications_queue_ck_notification_queue_channel CHECK (channel IN ('in_app', 'email', 'sms', 'push')), 
	CONSTRAINT fk_notifications_queue_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_notifications_queue_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # notifications_queue:idx_notif_queue_reference
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_notif_queue_reference ON notifications_queue (reference_type, reference_id)
    """)

    # notifications_queue:ix_notifications_queue_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_notifications_queue_tenantId" ON notifications_queue ("tenantId")
    """)

    # notifications_queue:ix_notifications_queue_user_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_notifications_queue_user_id ON notifications_queue (user_id)
    """)

    # po_headers
    op.execute("""
CREATE TABLE IF NOT EXISTS po_headers (
	id SERIAL NOT NULL, 
	"poNumber" VARCHAR NOT NULL, 
	"poDate" VARCHAR, 
	"vendorName" VARCHAR NOT NULL, 
	project VARCHAR, 
	"poTotal" NUMERIC(18, 4), 
	status VARCHAR, 
	notes TEXT, 
	shipping_address TEXT, 
	billing_address TEXT, 
	payment_terms VARCHAR(100), 
	shipping_method VARCHAR(100), 
	currency VARCHAR(3), 
	approved_by INTEGER, 
	approved_at TIMESTAMP WITH TIME ZONE, 
	subtotal NUMERIC(12, 2), 
	tax_total NUMERIC(12, 2), 
	freight_total NUMERIC(12, 2), 
	line_count INTEGER, 
	requested_by INTEGER, 
	project_id INTEGER, 
	vendor_id INTEGER, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_po_headers PRIMARY KEY (id), 
	CONSTRAINT "uq_po_headers_tenant_poNumber" UNIQUE ("tenantId", "poNumber"), 
	CONSTRAINT ck_po_headers_ck_po_headers_status CHECK (status IN ('draft', 'submitted', 'approved', 'received', 'closed', 'cancelled', 'Not Ordered', 'RFQ Sent', 'Under Review', 'Ordered', 'In Transit', 'Quality Check', 'Rejected', 'Open')), 
	CONSTRAINT fk_po_headers_approved_by_users FOREIGN KEY(approved_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_po_headers_requested_by_users FOREIGN KEY(requested_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_po_headers_project_id_projects FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	CONSTRAINT fk_po_headers_vendor_id_vendors FOREIGN KEY(vendor_id) REFERENCES vendors (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_po_headers_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # po_headers:idx_po_headers_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_po_headers_tenant_status ON po_headers ("tenantId", status)
    """)

    # po_headers:ix_po_headers_approved_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_po_headers_approved_by ON po_headers (approved_by)
    """)

    # po_headers:ix_po_headers_poNumber
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_po_headers_poNumber" ON po_headers ("poNumber")
    """)

    # po_headers:ix_po_headers_project_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_po_headers_project_id ON po_headers (project_id)
    """)

    # po_headers:ix_po_headers_requested_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_po_headers_requested_by ON po_headers (requested_by)
    """)

    # po_headers:ix_po_headers_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_po_headers_tenantId" ON po_headers ("tenantId")
    """)

    # po_headers:ix_po_headers_vendor_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_po_headers_vendor_id ON po_headers (vendor_id)
    """)

    # process_plans
    op.execute("""
CREATE TABLE IF NOT EXISTS process_plans (
	id SERIAL NOT NULL, 
	plan_number VARCHAR(50) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	part_family VARCHAR(100), 
	revision INTEGER, 
	status VARCHAR(50), 
	is_template BOOLEAN, 
	estimated_hours INTEGER, 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_process_plans PRIMARY KEY (id), 
	CONSTRAINT uq_process_plans_tenant_plan_number UNIQUE ("tenantId", plan_number), 
	CONSTRAINT ck_process_plans_ck_process_plans_status CHECK (status IN ('draft', 'active', 'archived')), 
	CONSTRAINT fk_process_plans_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_process_plans_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # process_plans:idx_process_plans_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_process_plans_tenant_status ON process_plans ("tenantId", status)
    """)

    # process_plans:ix_process_plans_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_process_plans_created_by ON process_plans (created_by)
    """)

    # process_plans:ix_process_plans_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_process_plans_tenantId" ON process_plans ("tenantId")
    """)

    # rfq_headers
    op.execute("""
CREATE TABLE IF NOT EXISTS rfq_headers (
	id SERIAL NOT NULL, 
	rfq_number VARCHAR NOT NULL, 
	title VARCHAR NOT NULL, 
	description VARCHAR, 
	status VARCHAR, 
	issue_date TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	response_deadline TIMESTAMP WITH TIME ZONE, 
	awarded_to_vendor_id INTEGER, 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_rfq_headers PRIMARY KEY (id), 
	CONSTRAINT uq_rfq_headers_tenant_rfq_number UNIQUE ("tenantId", rfq_number), 
	CONSTRAINT ck_rfq_headers_ck_rfq_status CHECK (status IN ('draft', 'sent', 'responded', 'awarded', 'cancelled')), 
	CONSTRAINT fk_rfq_headers_awarded_to_vendor_id_vendors FOREIGN KEY(awarded_to_vendor_id) REFERENCES vendors (id) ON DELETE SET NULL, 
	CONSTRAINT fk_rfq_headers_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL, 
	CONSTRAINT "fk_rfq_headers_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # rfq_headers:idx_rfq_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_rfq_tenant_status ON rfq_headers ("tenantId", status)
    """)

    # rfq_headers:ix_rfq_headers_awarded_to_vendor_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_rfq_headers_awarded_to_vendor_id ON rfq_headers (awarded_to_vendor_id)
    """)

    # rfq_headers:ix_rfq_headers_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_rfq_headers_created_by ON rfq_headers (created_by)
    """)

    # rfq_headers:ix_rfq_headers_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_rfq_headers_tenantId" ON rfq_headers ("tenantId")
    """)

    # role_permissions
    op.execute("""
CREATE TABLE IF NOT EXISTS role_permissions (
	role_id INTEGER NOT NULL, 
	permission_id INTEGER NOT NULL, 
	CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id), 
	CONSTRAINT fk_role_permissions_role_id_roles FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE, 
	CONSTRAINT fk_role_permissions_permission_id_permissions FOREIGN KEY(permission_id) REFERENCES permissions (id) ON DELETE CASCADE
)
    """)

    # role_permissions:ix_role_permissions_permission_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_role_permissions_permission_id ON role_permissions (permission_id)
    """)

    # role_permissions:ix_role_permissions_role_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_role_permissions_role_id ON role_permissions (role_id)
    """)

    # service_bom_headers
    op.execute("""
CREATE TABLE IF NOT EXISTS service_bom_headers (
	id SERIAL NOT NULL, 
	bom_number VARCHAR(50) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	parent_product_pn VARCHAR(100), 
	revision INTEGER, 
	status VARCHAR(50), 
	service_type VARCHAR(50), 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_service_bom_headers PRIMARY KEY (id), 
	CONSTRAINT uq_service_bom_headers_tenant_bom_number UNIQUE ("tenantId", bom_number), 
	CONSTRAINT ck_service_bom_headers_ck_service_bom_headers_status CHECK (status IN ('draft', 'active', 'archived')), 
	CONSTRAINT fk_service_bom_headers_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_service_bom_headers_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # service_bom_headers:idx_service_bom_headers_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_service_bom_headers_tenant_status ON service_bom_headers ("tenantId", status)
    """)

    # service_bom_headers:ix_service_bom_headers_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_service_bom_headers_created_by ON service_bom_headers (created_by)
    """)

    # service_bom_headers:ix_service_bom_headers_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_service_bom_headers_tenantId" ON service_bom_headers ("tenantId")
    """)

    # user_mfa
    op.execute("""
CREATE TABLE IF NOT EXISTS user_mfa (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	mfa_type VARCHAR(50) NOT NULL, 
	secret_key VARCHAR(512) NOT NULL, 
	backup_codes JSON, 
	is_enabled BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	last_used_at TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_user_mfa PRIMARY KEY (id), 
	CONSTRAINT ck_user_mfa_ck_user_mfa_mfa_type CHECK (mfa_type IN ('totp', 'sms', 'email', 'webauthn', 'backup_code')), 
	CONSTRAINT fk_user_mfa_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_user_mfa_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # user_mfa:idx_user_mfa_type
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_user_mfa_type ON user_mfa (mfa_type)
    """)

    # user_mfa:ix_user_mfa_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_user_mfa_tenantId" ON user_mfa ("tenantId")
    """)

    # user_mfa:ix_user_mfa_user_id
    op.execute("""
CREATE UNIQUE INDEX IF NOT EXISTS ix_user_mfa_user_id ON user_mfa (user_id)
    """)

    # user_roles
    op.execute("""
CREATE TABLE IF NOT EXISTS user_roles (
	user_id INTEGER NOT NULL, 
	role_id INTEGER NOT NULL, 
	CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id), 
	CONSTRAINT fk_user_roles_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_user_roles_role_id_roles FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE
)
    """)

    # user_roles:ix_user_roles_role_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_user_roles_role_id ON user_roles (role_id)
    """)

    # user_roles:ix_user_roles_user_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_user_roles_user_id ON user_roles (user_id)
    """)

    # user_sessions
    op.execute("""
CREATE TABLE IF NOT EXISTS user_sessions (
	id SERIAL NOT NULL, 
	"userId" INTEGER NOT NULL, 
	"sessionToken" VARCHAR NOT NULL, 
	"ipAddress" VARCHAR, 
	"userAgent" VARCHAR, 
	"lastActivity" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
	"isActive" BOOLEAN, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_user_sessions PRIMARY KEY (id), 
	CONSTRAINT "fk_user_sessions_userId_users" FOREIGN KEY("userId") REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_user_sessions_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # user_sessions:ix_user_sessions_sessionToken
    op.execute("""
CREATE UNIQUE INDEX IF NOT EXISTS "ix_user_sessions_sessionToken" ON user_sessions ("sessionToken")
    """)

    # user_sessions:ix_user_sessions_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_user_sessions_tenantId" ON user_sessions ("tenantId")
    """)

    # user_sessions:ix_user_sessions_userId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_user_sessions_userId" ON user_sessions ("userId")
    """)

    # audit_log_changes
    op.execute("""
CREATE TABLE IF NOT EXISTS audit_log_changes (
	id SERIAL NOT NULL, 
	audit_log_id INTEGER NOT NULL, 
	field_name VARCHAR NOT NULL, 
	old_value TEXT, 
	new_value TEXT, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_audit_log_changes PRIMARY KEY (id), 
	CONSTRAINT fk_audit_log_changes_audit_log_id_audit_logs FOREIGN KEY(audit_log_id) REFERENCES audit_logs (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_audit_log_changes_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # audit_log_changes:ix_audit_log_changes_audit_log_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_audit_log_changes_audit_log_id ON audit_log_changes (audit_log_id)
    """)

    # audit_log_changes:ix_audit_log_changes_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_audit_log_changes_tenantId" ON audit_log_changes ("tenantId")
    """)

    # bom_snapshots
    op.execute("""
CREATE TABLE IF NOT EXISTS bom_snapshots (
	id SERIAL NOT NULL, 
	bom_id INTEGER NOT NULL, 
	snapshot_name VARCHAR(255) NOT NULL, 
	snapshot_type VARCHAR(50) NOT NULL, 
	snapshot_data JSON NOT NULL, 
	version VARCHAR(50), 
	change_description TEXT, 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_bom_snapshots PRIMARY KEY (id), 
	CONSTRAINT ck_bom_snapshots_ck_bom_snapshots_snapshot_type CHECK (snapshot_type IN ('baseline', 'release', 'archive')), 
	CONSTRAINT fk_bom_snapshots_bom_id_boms FOREIGN KEY(bom_id) REFERENCES boms (id) ON DELETE CASCADE, 
	CONSTRAINT fk_bom_snapshots_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_bom_snapshots_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # bom_snapshots:ix_bom_snapshots_bom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_snapshots_bom_id ON bom_snapshots (bom_id)
    """)

    # bom_snapshots:ix_bom_snapshots_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_snapshots_created_by ON bom_snapshots (created_by)
    """)

    # bom_snapshots:ix_bom_snapshots_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_bom_snapshots_tenantId" ON bom_snapshots ("tenantId")
    """)

    # bom_variants
    op.execute("""
CREATE TABLE IF NOT EXISTS bom_variants (
	id SERIAL NOT NULL, 
	base_bom_id INTEGER NOT NULL, 
	variant_name VARCHAR(255) NOT NULL, 
	description TEXT, 
	configuration_rules JSON, 
	status VARCHAR(50), 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_bom_variants PRIMARY KEY (id), 
	CONSTRAINT ck_bom_variants_ck_bom_variants_status CHECK (status IN ('active', 'inactive', 'draft')), 
	CONSTRAINT fk_bom_variants_base_bom_id_boms FOREIGN KEY(base_bom_id) REFERENCES boms (id) ON DELETE CASCADE, 
	CONSTRAINT fk_bom_variants_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_bom_variants_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # bom_variants:idx_bom_variants_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_bom_variants_tenant_status ON bom_variants ("tenantId", status)
    """)

    # bom_variants:ix_bom_variants_base_bom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_variants_base_bom_id ON bom_variants (base_bom_id)
    """)

    # bom_variants:ix_bom_variants_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_variants_created_by ON bom_variants (created_by)
    """)

    # bom_variants:ix_bom_variants_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_bom_variants_tenantId" ON bom_variants ("tenantId")
    """)

    # compliance_certificates
    op.execute("""
CREATE TABLE IF NOT EXISTS compliance_certificates (
	id SERIAL NOT NULL, 
	certificate_number VARCHAR(100) NOT NULL, 
	part_id INTEGER, 
	compliance_type VARCHAR(100) NOT NULL, 
	issuing_body VARCHAR(255), 
	issued_date TIMESTAMP WITH TIME ZONE, 
	expiry_date TIMESTAMP WITH TIME ZONE, 
	status VARCHAR(50), 
	document_url TEXT, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_compliance_certificates PRIMARY KEY (id), 
	CONSTRAINT uq_compliance_certificates_tenant_certificate_number UNIQUE ("tenantId", certificate_number), 
	CONSTRAINT ck_compliance_certificates_ck_compliance_certificates_status CHECK (status IN ('active', 'expired', 'revoked')), 
	CONSTRAINT fk_compliance_certificates_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_compliance_certificates_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # compliance_certificates:idx_compliance_certificates_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_compliance_certificates_tenant_status ON compliance_certificates ("tenantId", status)
    """)

    # compliance_certificates:ix_compliance_certificates_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_compliance_certificates_part_id ON compliance_certificates (part_id)
    """)

    # compliance_certificates:ix_compliance_certificates_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_compliance_certificates_tenantId" ON compliance_certificates ("tenantId")
    """)

    # contract_attachments
    op.execute("""
CREATE TABLE IF NOT EXISTS contract_attachments (
	id SERIAL NOT NULL, 
	contract_id INTEGER NOT NULL, 
	filename VARCHAR(255), 
	file_url TEXT, 
	file_type VARCHAR(50), 
	file_size INTEGER, 
	uploaded_by INTEGER, 
	description TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_contract_attachments PRIMARY KEY (id), 
	CONSTRAINT fk_contract_attachments_contract_id_contracts FOREIGN KEY(contract_id) REFERENCES contracts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_contract_attachments_uploaded_by_users FOREIGN KEY(uploaded_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_contract_attachments_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # contract_attachments:ix_contract_attachments_contract_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_contract_attachments_contract_id ON contract_attachments (contract_id)
    """)

    # contract_attachments:ix_contract_attachments_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_contract_attachments_tenantId" ON contract_attachments ("tenantId")
    """)

    # contract_attachments:ix_contract_attachments_uploaded_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_contract_attachments_uploaded_by ON contract_attachments (uploaded_by)
    """)

    # contract_pricing_tiers
    op.execute("""
CREATE TABLE IF NOT EXISTS contract_pricing_tiers (
	id SERIAL NOT NULL, 
	contract_id INTEGER NOT NULL, 
	min_qty INTEGER, 
	max_qty INTEGER, 
	unit_price NUMERIC(18, 4) NOT NULL, 
	currency VARCHAR(3), 
	sort_order INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_contract_pricing_tiers PRIMARY KEY (id), 
	CONSTRAINT fk_contract_pricing_tiers_contract_id_contracts FOREIGN KEY(contract_id) REFERENCES contracts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_contract_pricing_tiers_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # contract_pricing_tiers:ix_contract_pricing_tiers_contract_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_contract_pricing_tiers_contract_id ON contract_pricing_tiers (contract_id)
    """)

    # contract_pricing_tiers:ix_contract_pricing_tiers_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_contract_pricing_tiers_tenantId" ON contract_pricing_tiers ("tenantId")
    """)

    # demand_forecasts
    op.execute("""
CREATE TABLE IF NOT EXISTS demand_forecasts (
	id SERIAL NOT NULL, 
	"partId" INTEGER NOT NULL, 
	forecast JSON, 
	confidence FLOAT, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_demand_forecasts PRIMARY KEY (id), 
	CONSTRAINT "fk_demand_forecasts_partId_parts" FOREIGN KEY("partId") REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_demand_forecasts_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # demand_forecasts:ix_demand_forecasts_partId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_demand_forecasts_partId" ON demand_forecasts ("partId")
    """)

    # demand_forecasts:ix_demand_forecasts_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_demand_forecasts_tenantId" ON demand_forecasts ("tenantId")
    """)

    # eco_approvals
    op.execute("""
CREATE TABLE IF NOT EXISTS eco_approvals (
	id SERIAL NOT NULL, 
	eco_id INTEGER NOT NULL, 
	approver_id INTEGER NOT NULL, 
	approval_order INTEGER NOT NULL, 
	status VARCHAR(50), 
	comments TEXT, 
	signed_at TIMESTAMP WITH TIME ZONE, 
	digital_signature TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_eco_approvals PRIMARY KEY (id), 
	CONSTRAINT ck_eco_approvals_ck_eco_approvals_status CHECK (status IN ('pending', 'approved', 'rejected')), 
	CONSTRAINT fk_eco_approvals_eco_id_eco_headers FOREIGN KEY(eco_id) REFERENCES eco_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_eco_approvals_approver_id_users FOREIGN KEY(approver_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_eco_approvals_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # eco_approvals:idx_eco_approvals_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_eco_approvals_tenant_status ON eco_approvals ("tenantId", status)
    """)

    # eco_approvals:ix_eco_approvals_approver_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_approvals_approver_id ON eco_approvals (approver_id)
    """)

    # eco_approvals:ix_eco_approvals_eco_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_approvals_eco_id ON eco_approvals (eco_id)
    """)

    # eco_approvals:ix_eco_approvals_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_eco_approvals_tenantId" ON eco_approvals ("tenantId")
    """)

    # eco_items
    op.execute("""
CREATE TABLE IF NOT EXISTS eco_items (
	id SERIAL NOT NULL, 
	eco_id INTEGER NOT NULL, 
	part_id INTEGER NOT NULL, 
	bom_id INTEGER, 
	change_type VARCHAR(50) NOT NULL, 
	old_value JSON, 
	new_value JSON, 
	impact_description TEXT, 
	affected_quantity INTEGER, 
	status VARCHAR(50), 
	implemented_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_eco_items PRIMARY KEY (id), 
	CONSTRAINT ck_eco_items_ck_eco_items_change_type CHECK (change_type IN ('add', 'delete', 'modify', 'replace')), 
	CONSTRAINT fk_eco_items_eco_id_eco_headers FOREIGN KEY(eco_id) REFERENCES eco_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_eco_items_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_eco_items_bom_id_boms FOREIGN KEY(bom_id) REFERENCES boms (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_eco_items_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # eco_items:idx_eco_items_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_eco_items_tenant_status ON eco_items ("tenantId", status)
    """)

    # eco_items:ix_eco_items_bom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_items_bom_id ON eco_items (bom_id)
    """)

    # eco_items:ix_eco_items_eco_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_items_eco_id ON eco_items (eco_id)
    """)

    # eco_items:ix_eco_items_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_items_part_id ON eco_items (part_id)
    """)

    # eco_items:ix_eco_items_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_eco_items_tenantId" ON eco_items ("tenantId")
    """)

    # eco_notifications
    op.execute("""
CREATE TABLE IF NOT EXISTS eco_notifications (
	id SERIAL NOT NULL, 
	eco_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	notification_type VARCHAR(50) NOT NULL, 
	message TEXT, 
	is_read BOOLEAN, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_eco_notifications PRIMARY KEY (id), 
	CONSTRAINT fk_eco_notifications_eco_id_eco_headers FOREIGN KEY(eco_id) REFERENCES eco_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_eco_notifications_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_eco_notifications_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # eco_notifications:ix_eco_notifications_eco_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_notifications_eco_id ON eco_notifications (eco_id)
    """)

    # eco_notifications:ix_eco_notifications_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_eco_notifications_tenantId" ON eco_notifications ("tenantId")
    """)

    # eco_notifications:ix_eco_notifications_user_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_notifications_user_id ON eco_notifications (user_id)
    """)

    # inspection_plans
    op.execute("""
CREATE TABLE IF NOT EXISTS inspection_plans (
	id SERIAL NOT NULL, 
	plan_name VARCHAR(255) NOT NULL, 
	part_id INTEGER, 
	plan_type VARCHAR(50) NOT NULL, 
	characteristics JSON NOT NULL, 
	frequency VARCHAR(50), 
	frequency_value INTEGER, 
	sample_size INTEGER, 
	status VARCHAR(50), 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_inspection_plans PRIMARY KEY (id), 
	CONSTRAINT ck_inspection_plans_ck_inspection_plans_status CHECK (status IN ('active', 'inactive', 'draft')), 
	CONSTRAINT fk_inspection_plans_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inspection_plans_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_inspection_plans_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # inspection_plans:idx_inspection_plans_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_inspection_plans_tenant_status ON inspection_plans ("tenantId", status)
    """)

    # inspection_plans:ix_inspection_plans_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inspection_plans_created_by ON inspection_plans (created_by)
    """)

    # inspection_plans:ix_inspection_plans_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inspection_plans_part_id ON inspection_plans (part_id)
    """)

    # inspection_plans:ix_inspection_plans_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_inspection_plans_tenantId" ON inspection_plans ("tenantId")
    """)

    # interchangeability_suggestions
    op.execute("""
CREATE TABLE IF NOT EXISTS interchangeability_suggestions (
	id SERIAL NOT NULL, 
	"partId" INTEGER NOT NULL, 
	"suggestedPartId" INTEGER NOT NULL, 
	score FLOAT, 
	reason TEXT, 
	status VARCHAR, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_interchangeability_suggestions PRIMARY KEY (id), 
	CONSTRAINT ck_interchangeability_suggestions_ck_interchangeability_975a CHECK (status IN ('pending', 'approved', 'rejected', 'reviewed')), 
	CONSTRAINT "fk_interchangeability_suggestions_partId_parts" FOREIGN KEY("partId") REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_interchangeability_suggestions_suggestedPartId_parts" FOREIGN KEY("suggestedPartId") REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_interchangeability_suggestions_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # interchangeability_suggestions:idx_interchangeability_suggestions_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_interchangeability_suggestions_tenant_status ON interchangeability_suggestions ("tenantId", status)
    """)

    # interchangeability_suggestions:ix_interchangeability_suggestions_partId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_interchangeability_suggestions_partId" ON interchangeability_suggestions ("partId")
    """)

    # interchangeability_suggestions:ix_interchangeability_suggestions_suggestedPartId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_interchangeability_suggestions_suggestedPartId" ON interchangeability_suggestions ("suggestedPartId")
    """)

    # interchangeability_suggestions:ix_interchangeability_suggestions_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_interchangeability_suggestions_tenantId" ON interchangeability_suggestions ("tenantId")
    """)

    # inventory
    op.execute("""
CREATE TABLE IF NOT EXISTS inventory (
	id SERIAL NOT NULL, 
	part_id INTEGER NOT NULL, 
	warehouse_id INTEGER NOT NULL, 
	bin_location_id INTEGER, 
	lot_number VARCHAR(100), 
	serial_number VARCHAR(100), 
	quantity_on_hand NUMERIC(10, 4), 
	quantity_reserved NUMERIC(10, 4), 
	unit_cost NUMERIC(10, 4), 
	last_received_date TIMESTAMP WITH TIME ZONE, 
	last_issued_date TIMESTAMP WITH TIME ZONE, 
	expiry_date DATE, 
	status VARCHAR(50), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_inventory PRIMARY KEY (id), 
	CONSTRAINT uq_inventory_part_location_lot UNIQUE (part_id, warehouse_id, bin_location_id, lot_number), 
	CONSTRAINT ck_inventory_ck_inventory_status CHECK (status IN ('available', 'reserved', 'quarantined', 'damaged', 'consumed')), 
	CONSTRAINT fk_inventory_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_warehouse_id_warehouses FOREIGN KEY(warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_bin_location_id_bin_locations FOREIGN KEY(bin_location_id) REFERENCES bin_locations (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_inventory_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # inventory:idx_inventory_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_status ON inventory ("tenantId", status)
    """)

    # inventory:ix_inventory_bin_location_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_bin_location_id ON inventory (bin_location_id)
    """)

    # inventory:ix_inventory_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_part_id ON inventory (part_id)
    """)

    # inventory:ix_inventory_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_inventory_tenantId" ON inventory ("tenantId")
    """)

    # inventory:ix_inventory_warehouse_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_warehouse_id ON inventory (warehouse_id)
    """)

    # inventory_reservations
    op.execute("""
CREATE TABLE IF NOT EXISTS inventory_reservations (
	id SERIAL NOT NULL, 
	part_id INTEGER NOT NULL, 
	warehouse_id INTEGER NOT NULL, 
	quantity_reserved NUMERIC(10, 4) NOT NULL, 
	reference_type VARCHAR(50), 
	reference_id INTEGER, 
	reserved_by INTEGER, 
	reserved_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	expires_at TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_inventory_reservations PRIMARY KEY (id), 
	CONSTRAINT fk_inventory_reservations_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_reservations_warehouse_id_warehouses FOREIGN KEY(warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_reservations_reserved_by_users FOREIGN KEY(reserved_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_inventory_reservations_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # inventory_reservations:idx_inv_reservation_reference
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_inv_reservation_reference ON inventory_reservations (reference_type, reference_id)
    """)

    # inventory_reservations:ix_inventory_reservations_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_reservations_part_id ON inventory_reservations (part_id)
    """)

    # inventory_reservations:ix_inventory_reservations_reserved_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_reservations_reserved_by ON inventory_reservations (reserved_by)
    """)

    # inventory_reservations:ix_inventory_reservations_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_inventory_reservations_tenantId" ON inventory_reservations ("tenantId")
    """)

    # inventory_reservations:ix_inventory_reservations_warehouse_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_reservations_warehouse_id ON inventory_reservations (warehouse_id)
    """)

    # inventory_transactions
    op.execute("""
CREATE TABLE IF NOT EXISTS inventory_transactions (
	id SERIAL NOT NULL, 
	transaction_number VARCHAR(50) NOT NULL, 
	part_id INTEGER NOT NULL, 
	warehouse_id INTEGER NOT NULL, 
	bin_location_id INTEGER, 
	transaction_type VARCHAR(50) NOT NULL, 
	quantity NUMERIC(10, 4) NOT NULL, 
	unit_cost NUMERIC(10, 4), 
	total_cost NUMERIC(10, 4), 
	reference_type VARCHAR(50), 
	reference_id INTEGER, 
	lot_number VARCHAR(100), 
	serial_number VARCHAR(100), 
	from_warehouse_id INTEGER, 
	to_warehouse_id INTEGER, 
	reason TEXT, 
	performed_by INTEGER, 
	performed_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_inventory_transactions PRIMARY KEY (id), 
	CONSTRAINT uq_inventory_transactions_tenant_transaction_number UNIQUE ("tenantId", transaction_number), 
	CONSTRAINT ck_inventory_transactions_ck_inv_txn_transaction_type CHECK (transaction_type IN ('receipt', 'issue', 'transfer', 'adjustment', 'return')), 
	CONSTRAINT ck_inventory_transactions_ck_inv_txn_reference_type CHECK (reference_type IN ('po', 'work_order', 'transfer', 'adjustment', 'sales_order', 'return')), 
	CONSTRAINT fk_inventory_transactions_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_transactions_warehouse_id_warehouses FOREIGN KEY(warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_transactions_bin_location_id_bin_locations FOREIGN KEY(bin_location_id) REFERENCES bin_locations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_transactions_from_warehouse_id_warehouses FOREIGN KEY(from_warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_transactions_to_warehouse_id_warehouses FOREIGN KEY(to_warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inventory_transactions_performed_by_users FOREIGN KEY(performed_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_inventory_transactions_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # inventory_transactions:idx_inv_txn_reference
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_inv_txn_reference ON inventory_transactions (reference_type, reference_id)
    """)

    # inventory_transactions:ix_inventory_transactions_bin_location_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_transactions_bin_location_id ON inventory_transactions (bin_location_id)
    """)

    # inventory_transactions:ix_inventory_transactions_from_warehouse_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_transactions_from_warehouse_id ON inventory_transactions (from_warehouse_id)
    """)

    # inventory_transactions:ix_inventory_transactions_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_transactions_part_id ON inventory_transactions (part_id)
    """)

    # inventory_transactions:ix_inventory_transactions_performed_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_transactions_performed_by ON inventory_transactions (performed_by)
    """)

    # inventory_transactions:ix_inventory_transactions_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_inventory_transactions_tenantId" ON inventory_transactions ("tenantId")
    """)

    # inventory_transactions:ix_inventory_transactions_to_warehouse_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_transactions_to_warehouse_id ON inventory_transactions (to_warehouse_id)
    """)

    # inventory_transactions:ix_inventory_transactions_warehouse_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inventory_transactions_warehouse_id ON inventory_transactions (warehouse_id)
    """)

    # mbom_headers
    op.execute("""
CREATE TABLE IF NOT EXISTS mbom_headers (
	id SERIAL NOT NULL, 
	mbom_number VARCHAR(50) NOT NULL, 
	ebom_id INTEGER, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	status VARCHAR(50), 
	version VARCHAR(50), 
	revision INTEGER, 
	work_center VARCHAR(100), 
	setup_time INTERVAL, 
	run_time INTERVAL, 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_mbom_headers PRIMARY KEY (id), 
	CONSTRAINT uq_mbom_headers_tenant_mbom_number UNIQUE ("tenantId", mbom_number), 
	CONSTRAINT ck_mbom_headers_ck_mbom_headers_status CHECK (status IN ('draft', 'released', 'archived')), 
	CONSTRAINT fk_mbom_headers_ebom_id_boms FOREIGN KEY(ebom_id) REFERENCES boms (id) ON DELETE CASCADE, 
	CONSTRAINT fk_mbom_headers_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_mbom_headers_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # mbom_headers:idx_mbom_headers_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_mbom_headers_tenant_status ON mbom_headers ("tenantId", status)
    """)

    # mbom_headers:ix_mbom_headers_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_mbom_headers_created_by ON mbom_headers (created_by)
    """)

    # mbom_headers:ix_mbom_headers_ebom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_mbom_headers_ebom_id ON mbom_headers (ebom_id)
    """)

    # mbom_headers:ix_mbom_headers_mbom_number
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_mbom_headers_mbom_number ON mbom_headers (mbom_number)
    """)

    # mbom_headers:ix_mbom_headers_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_mbom_headers_tenantId" ON mbom_headers ("tenantId")
    """)

    # part_compliance
    op.execute("""
CREATE TABLE IF NOT EXISTS part_compliance (
	part_id INTEGER NOT NULL, 
	compliance_id INTEGER NOT NULL, 
	CONSTRAINT pk_part_compliance PRIMARY KEY (part_id, compliance_id), 
	CONSTRAINT fk_part_compliance_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_part_compliance_compliance_id_compliance FOREIGN KEY(compliance_id) REFERENCES compliance (id) ON DELETE CASCADE
)
    """)

    # part_compliance:ix_part_compliance_compliance_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_part_compliance_compliance_id ON part_compliance (compliance_id)
    """)

    # part_compliance:ix_part_compliance_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_part_compliance_part_id ON part_compliance (part_id)
    """)

    # part_lifecycles
    op.execute("""
CREATE TABLE IF NOT EXISTS part_lifecycles (
	id SERIAL NOT NULL, 
	part_id INTEGER NOT NULL, 
	state VARCHAR(50) NOT NULL, 
	previous_state VARCHAR(50), 
	entered_by INTEGER, 
	entered_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	effective_date DATE, 
	expiry_date DATE, 
	notes TEXT, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_part_lifecycles PRIMARY KEY (id), 
	CONSTRAINT ck_part_lifecycles_ck_part_lifecycles_state CHECK (state IN ('concept', 'design', 'prototype', 'production', 'end_of_life', 'obsolete', 'draft', 'review', 'approved')), 
	CONSTRAINT fk_part_lifecycles_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_part_lifecycles_entered_by_users FOREIGN KEY(entered_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_part_lifecycles_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # part_lifecycles:ix_part_lifecycles_entered_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_part_lifecycles_entered_by ON part_lifecycles (entered_by)
    """)

    # part_lifecycles:ix_part_lifecycles_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_part_lifecycles_part_id ON part_lifecycles (part_id)
    """)

    # part_lifecycles:ix_part_lifecycles_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_part_lifecycles_tenantId" ON part_lifecycles ("tenantId")
    """)

    # part_tags
    op.execute("""
CREATE TABLE IF NOT EXISTS part_tags (
	part_id INTEGER NOT NULL, 
	tag_id INTEGER NOT NULL, 
	CONSTRAINT pk_part_tags PRIMARY KEY (part_id, tag_id), 
	CONSTRAINT fk_part_tags_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_part_tags_tag_id_tags FOREIGN KEY(tag_id) REFERENCES tags (id) ON DELETE CASCADE
)
    """)

    # part_tags:ix_part_tags_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_part_tags_part_id ON part_tags (part_id)
    """)

    # part_tags:ix_part_tags_tag_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_part_tags_tag_id ON part_tags (tag_id)
    """)

    # price_history
    op.execute("""
CREATE TABLE IF NOT EXISTS price_history (
	id SERIAL NOT NULL, 
	"partId" INTEGER NOT NULL, 
	"vendorId" INTEGER, 
	price NUMERIC(18, 4) NOT NULL, 
	currency VARCHAR, 
	"effectiveDate" TIMESTAMP WITH TIME ZONE, 
	source VARCHAR, 
	"sourceReference" VARCHAR, 
	"recordedAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"updatedAt" TIMESTAMP WITH TIME ZONE, 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_price_history PRIMARY KEY (id), 
	CONSTRAINT "fk_price_history_partId_parts" FOREIGN KEY("partId") REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_price_history_vendorId_vendors" FOREIGN KEY("vendorId") REFERENCES vendors (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_price_history_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # price_history:ix_price_history_partId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_price_history_partId" ON price_history ("partId")
    """)

    # price_history:ix_price_history_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_price_history_tenantId" ON price_history ("tenantId")
    """)

    # price_history:ix_price_history_vendorId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_price_history_vendorId" ON price_history ("vendorId")
    """)

    # process_plan_steps
    op.execute("""
CREATE TABLE IF NOT EXISTS process_plan_steps (
	id SERIAL NOT NULL, 
	process_plan_id INTEGER NOT NULL, 
	step_number INTEGER NOT NULL, 
	step_name VARCHAR(255) NOT NULL, 
	description TEXT, 
	work_center VARCHAR(100), 
	setup_time_min INTEGER, 
	run_time_min INTEGER, 
	required_skills JSON, 
	tooling_required JSON, 
	inspection_required BOOLEAN, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_process_plan_steps PRIMARY KEY (id), 
	CONSTRAINT fk_process_plan_steps_process_plan_id_process_plans FOREIGN KEY(process_plan_id) REFERENCES process_plans (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_process_plan_steps_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # process_plan_steps:ix_process_plan_steps_process_plan_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_process_plan_steps_process_plan_id ON process_plan_steps (process_plan_id)
    """)

    # process_plan_steps:ix_process_plan_steps_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_process_plan_steps_tenantId" ON process_plan_steps ("tenantId")
    """)

    # rfq_line_items
    op.execute("""
CREATE TABLE IF NOT EXISTS rfq_line_items (
	id SERIAL NOT NULL, 
	rfq_id INTEGER NOT NULL, 
	part_id INTEGER NOT NULL, 
	quantity INTEGER NOT NULL, 
	target_price NUMERIC(18, 4), 
	notes VARCHAR, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_rfq_line_items PRIMARY KEY (id), 
	CONSTRAINT fk_rfq_line_items_rfq_id_rfq_headers FOREIGN KEY(rfq_id) REFERENCES rfq_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_rfq_line_items_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_rfq_line_items_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # rfq_line_items:ix_rfq_line_items_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_rfq_line_items_part_id ON rfq_line_items (part_id)
    """)

    # rfq_line_items:ix_rfq_line_items_rfq_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_rfq_line_items_rfq_id ON rfq_line_items (rfq_id)
    """)

    # rfq_line_items:ix_rfq_line_items_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_rfq_line_items_tenantId" ON rfq_line_items ("tenantId")
    """)

    # routing_tables
    op.execute("""
CREATE TABLE IF NOT EXISTS routing_tables (
	id SERIAL NOT NULL, 
	routing_number VARCHAR(50) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	part_id INTEGER, 
	revision INTEGER, 
	status VARCHAR(50), 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_routing_tables PRIMARY KEY (id), 
	CONSTRAINT uq_routing_tables_tenant_routing_number UNIQUE ("tenantId", routing_number), 
	CONSTRAINT ck_routing_tables_ck_routing_tables_status CHECK (status IN ('draft', 'active', 'archived')), 
	CONSTRAINT fk_routing_tables_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_routing_tables_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_routing_tables_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # routing_tables:idx_routing_tables_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_routing_tables_tenant_status ON routing_tables ("tenantId", status)
    """)

    # routing_tables:ix_routing_tables_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_routing_tables_created_by ON routing_tables (created_by)
    """)

    # routing_tables:ix_routing_tables_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_routing_tables_part_id ON routing_tables (part_id)
    """)

    # routing_tables:ix_routing_tables_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_routing_tables_tenantId" ON routing_tables ("tenantId")
    """)

    # service_bom_items
    op.execute("""
CREATE TABLE IF NOT EXISTS service_bom_items (
	id SERIAL NOT NULL, 
	service_bom_id INTEGER NOT NULL, 
	part_id INTEGER, 
	part_pn VARCHAR(100), 
	part_name VARCHAR(255), 
	quantity NUMERIC(10, 4), 
	unit VARCHAR(20), 
	service_type VARCHAR(50), 
	interval_hours INTEGER, 
	interval_months INTEGER, 
	is_wear_part BOOLEAN, 
	is_consumable BOOLEAN, 
	sort_order INTEGER, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_service_bom_items PRIMARY KEY (id), 
	CONSTRAINT ck_service_bom_items_ck_service_bom_items_service_type CHECK (service_type IN ('field_service', 'depot_repair', 'spare_parts', 'maintenance')), 
	CONSTRAINT fk_service_bom_items_service_bom_id_service_bom_headers FOREIGN KEY(service_bom_id) REFERENCES service_bom_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_service_bom_items_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_service_bom_items_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # service_bom_items:ix_service_bom_items_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_service_bom_items_part_id ON service_bom_items (part_id)
    """)

    # service_bom_items:ix_service_bom_items_service_bom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_service_bom_items_service_bom_id ON service_bom_items (service_bom_id)
    """)

    # service_bom_items:ix_service_bom_items_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_service_bom_items_tenantId" ON service_bom_items ("tenantId")
    """)

    # bom_baselines
    op.execute("""
CREATE TABLE IF NOT EXISTS bom_baselines (
	id SERIAL NOT NULL, 
	bom_id INTEGER NOT NULL, 
	baseline_name VARCHAR(255) NOT NULL, 
	snapshot_id INTEGER, 
	is_current BOOLEAN, 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_bom_baselines PRIMARY KEY (id), 
	CONSTRAINT fk_bom_baselines_bom_id_boms FOREIGN KEY(bom_id) REFERENCES boms (id) ON DELETE CASCADE, 
	CONSTRAINT fk_bom_baselines_snapshot_id_bom_snapshots FOREIGN KEY(snapshot_id) REFERENCES bom_snapshots (id) ON DELETE CASCADE, 
	CONSTRAINT fk_bom_baselines_created_by_users FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_bom_baselines_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # bom_baselines:ix_bom_baselines_bom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_baselines_bom_id ON bom_baselines (bom_id)
    """)

    # bom_baselines:ix_bom_baselines_created_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_baselines_created_by ON bom_baselines (created_by)
    """)

    # bom_baselines:ix_bom_baselines_snapshot_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_baselines_snapshot_id ON bom_baselines (snapshot_id)
    """)

    # bom_baselines:ix_bom_baselines_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_bom_baselines_tenantId" ON bom_baselines ("tenantId")
    """)

    # bom_variant_items
    op.execute("""
CREATE TABLE IF NOT EXISTS bom_variant_items (
	id SERIAL NOT NULL, 
	variant_id INTEGER NOT NULL, 
	part_id INTEGER NOT NULL, 
	quantity NUMERIC(10, 4) NOT NULL, 
	substitute_part_id INTEGER, 
	is_optional BOOLEAN, 
	condition_expression TEXT, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_bom_variant_items PRIMARY KEY (id), 
	CONSTRAINT fk_bom_variant_items_variant_id_bom_variants FOREIGN KEY(variant_id) REFERENCES bom_variants (id) ON DELETE CASCADE, 
	CONSTRAINT fk_bom_variant_items_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_bom_variant_items_substitute_part_id_parts FOREIGN KEY(substitute_part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_bom_variant_items_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # bom_variant_items:ix_bom_variant_items_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_variant_items_part_id ON bom_variant_items (part_id)
    """)

    # bom_variant_items:ix_bom_variant_items_substitute_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_variant_items_substitute_part_id ON bom_variant_items (substitute_part_id)
    """)

    # bom_variant_items:ix_bom_variant_items_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_bom_variant_items_tenantId" ON bom_variant_items ("tenantId")
    """)

    # bom_variant_items:ix_bom_variant_items_variant_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_bom_variant_items_variant_id ON bom_variant_items (variant_id)
    """)

    # eco_changes
    op.execute("""
CREATE TABLE IF NOT EXISTS eco_changes (
	id SERIAL NOT NULL, 
	eco_item_id INTEGER NOT NULL, 
	field_name VARCHAR NOT NULL, 
	old_value TEXT, 
	new_value TEXT, 
	"createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_eco_changes PRIMARY KEY (id), 
	CONSTRAINT fk_eco_changes_eco_item_id_eco_items FOREIGN KEY(eco_item_id) REFERENCES eco_items (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_eco_changes_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # eco_changes:ix_eco_changes_eco_item_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_eco_changes_eco_item_id ON eco_changes (eco_item_id)
    """)

    # eco_changes:ix_eco_changes_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_eco_changes_tenantId" ON eco_changes ("tenantId")
    """)

    # fai_attachments
    op.execute("""
CREATE TABLE IF NOT EXISTS fai_attachments (
	id SERIAL NOT NULL, 
	fai_report_id INTEGER NOT NULL, 
	filename VARCHAR(255), 
	file_url TEXT, 
	file_type VARCHAR(50), 
	file_size INTEGER, 
	uploaded_by INTEGER, 
	description TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_fai_attachments PRIMARY KEY (id), 
	CONSTRAINT fk_fai_attachments_fai_report_id_fai_reports FOREIGN KEY(fai_report_id) REFERENCES fai_reports (id) ON DELETE CASCADE, 
	CONSTRAINT fk_fai_attachments_uploaded_by_users FOREIGN KEY(uploaded_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_fai_attachments_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # fai_attachments:ix_fai_attachments_fai_report_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_fai_attachments_fai_report_id ON fai_attachments (fai_report_id)
    """)

    # fai_attachments:ix_fai_attachments_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_fai_attachments_tenantId" ON fai_attachments ("tenantId")
    """)

    # fai_attachments:ix_fai_attachments_uploaded_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_fai_attachments_uploaded_by ON fai_attachments (uploaded_by)
    """)

    # inspection_records
    op.execute("""
CREATE TABLE IF NOT EXISTS inspection_records (
	id SERIAL NOT NULL, 
	record_number VARCHAR(50) NOT NULL, 
	inspection_plan_id INTEGER, 
	part_id INTEGER NOT NULL, 
	lot_number VARCHAR(100), 
	serial_number VARCHAR(100), 
	inspection_type VARCHAR(50) NOT NULL, 
	inspector_id INTEGER, 
	inspection_date TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	result VARCHAR(50), 
	measurements JSON, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_inspection_records PRIMARY KEY (id), 
	CONSTRAINT uq_inspection_records_tenant_record_number UNIQUE ("tenantId", record_number), 
	CONSTRAINT ck_inspection_records_ck_inspection_records_result CHECK (result IN ('pass', 'fail', 'conditional', 'pending')), 
	CONSTRAINT fk_inspection_records_inspection_plan_id_inspection_plans FOREIGN KEY(inspection_plan_id) REFERENCES inspection_plans (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inspection_records_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_inspection_records_inspector_id_users FOREIGN KEY(inspector_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_inspection_records_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # inspection_records:ix_inspection_records_inspection_plan_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inspection_records_inspection_plan_id ON inspection_records (inspection_plan_id)
    """)

    # inspection_records:ix_inspection_records_inspector_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inspection_records_inspector_id ON inspection_records (inspector_id)
    """)

    # inspection_records:ix_inspection_records_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_inspection_records_part_id ON inspection_records (part_id)
    """)

    # inspection_records:ix_inspection_records_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_inspection_records_tenantId" ON inspection_records ("tenantId")
    """)

    # mbom_items
    op.execute("""
CREATE TABLE IF NOT EXISTS mbom_items (
	id SERIAL NOT NULL, 
	mbom_id INTEGER NOT NULL, 
	part_id INTEGER NOT NULL, 
	quantity NUMERIC(10, 4) NOT NULL, 
	unit VARCHAR(20), 
	operation_number INTEGER, 
	work_center VARCHAR(100), 
	setup_time INTERVAL, 
	run_time INTERVAL, 
	scrap_factor NUMERIC(5, 2), 
	notes TEXT, 
	parent_item_id INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_mbom_items PRIMARY KEY (id), 
	CONSTRAINT fk_mbom_items_mbom_id_mbom_headers FOREIGN KEY(mbom_id) REFERENCES mbom_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_mbom_items_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_mbom_items_parent_item_id_mbom_items FOREIGN KEY(parent_item_id) REFERENCES mbom_items (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_mbom_items_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # mbom_items:ix_mbom_items_mbom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_mbom_items_mbom_id ON mbom_items (mbom_id)
    """)

    # mbom_items:ix_mbom_items_parent_item_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_mbom_items_parent_item_id ON mbom_items (parent_item_id)
    """)

    # mbom_items:ix_mbom_items_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_mbom_items_part_id ON mbom_items (part_id)
    """)

    # mbom_items:ix_mbom_items_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_mbom_items_tenantId" ON mbom_items ("tenantId")
    """)

    # mbom_operations
    op.execute("""
CREATE TABLE IF NOT EXISTS mbom_operations (
	id SERIAL NOT NULL, 
	mbom_id INTEGER NOT NULL, 
	operation_number INTEGER NOT NULL, 
	operation_name VARCHAR(255) NOT NULL, 
	description TEXT, 
	work_center VARCHAR(100), 
	setup_time INTERVAL, 
	run_time INTERVAL, 
	wait_time INTERVAL, 
	move_time INTERVAL, 
	tooling_required TEXT, 
	skills_required TEXT, 
	instructions TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_mbom_operations PRIMARY KEY (id), 
	CONSTRAINT fk_mbom_operations_mbom_id_mbom_headers FOREIGN KEY(mbom_id) REFERENCES mbom_headers (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_mbom_operations_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # mbom_operations:ix_mbom_operations_mbom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_mbom_operations_mbom_id ON mbom_operations (mbom_id)
    """)

    # mbom_operations:ix_mbom_operations_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_mbom_operations_tenantId" ON mbom_operations ("tenantId")
    """)

    # pricing_agreement_volume_tiers
    op.execute("""
CREATE TABLE IF NOT EXISTS pricing_agreement_volume_tiers (
	id SERIAL NOT NULL, 
	pricing_agreement_id INTEGER NOT NULL, 
	min_qty INTEGER, 
	max_qty INTEGER, 
	unit_price NUMERIC(18, 4) NOT NULL, 
	sort_order INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_pricing_agreement_volume_tiers PRIMARY KEY (id), 
	CONSTRAINT fk_pricing_agreement_volume_tiers_pricing_agreement_id__29d0 FOREIGN KEY(pricing_agreement_id) REFERENCES pricing_agreements (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_pricing_agreement_volume_tiers_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # pricing_agreement_volume_tiers:ix_pricing_agreement_volume_tiers_pricing_agreement_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_pricing_agreement_volume_tiers_pricing_agreement_id ON pricing_agreement_volume_tiers (pricing_agreement_id)
    """)

    # pricing_agreement_volume_tiers:ix_pricing_agreement_volume_tiers_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_pricing_agreement_volume_tiers_tenantId" ON pricing_agreement_volume_tiers ("tenantId")
    """)

    # rfq_supplier_responses
    op.execute("""
CREATE TABLE IF NOT EXISTS rfq_supplier_responses (
	id SERIAL NOT NULL, 
	rfq_id INTEGER NOT NULL, 
	supplier_user_id INTEGER NOT NULL, 
	line_item_id INTEGER NOT NULL, 
	quoted_price NUMERIC(18, 4) NOT NULL, 
	quoted_lead_time_days INTEGER, 
	notes VARCHAR, 
	status VARCHAR, 
	submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_rfq_supplier_responses PRIMARY KEY (id), 
	CONSTRAINT ck_rfq_supplier_responses_ck_rfq_response_status CHECK (status IN ('submitted', 'accepted', 'rejected')), 
	CONSTRAINT fk_rfq_supplier_responses_rfq_id_rfq_headers FOREIGN KEY(rfq_id) REFERENCES rfq_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_rfq_supplier_responses_supplier_user_id_supplier_users FOREIGN KEY(supplier_user_id) REFERENCES supplier_users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_rfq_supplier_responses_line_item_id_rfq_line_items FOREIGN KEY(line_item_id) REFERENCES rfq_line_items (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_rfq_supplier_responses_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # rfq_supplier_responses:ix_rfq_supplier_responses_line_item_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_rfq_supplier_responses_line_item_id ON rfq_supplier_responses (line_item_id)
    """)

    # rfq_supplier_responses:ix_rfq_supplier_responses_rfq_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_rfq_supplier_responses_rfq_id ON rfq_supplier_responses (rfq_id)
    """)

    # rfq_supplier_responses:ix_rfq_supplier_responses_supplier_user_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_rfq_supplier_responses_supplier_user_id ON rfq_supplier_responses (supplier_user_id)
    """)

    # rfq_supplier_responses:ix_rfq_supplier_responses_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_rfq_supplier_responses_tenantId" ON rfq_supplier_responses ("tenantId")
    """)

    # routing_operations
    op.execute("""
CREATE TABLE IF NOT EXISTS routing_operations (
	id SERIAL NOT NULL, 
	routing_id INTEGER NOT NULL, 
	operation_number INTEGER NOT NULL, 
	operation_name VARCHAR(255) NOT NULL, 
	description TEXT, 
	work_center VARCHAR(100), 
	setup_time_min INTEGER, 
	run_time_min INTEGER, 
	cycle_time_min INTEGER, 
	tooling JSON, 
	quality_checks JSON, 
	is_optional BOOLEAN, 
	external_operation BOOLEAN, 
	vendor_id INTEGER, 
	estimated_cost NUMERIC(10, 4), 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_routing_operations PRIMARY KEY (id), 
	CONSTRAINT fk_routing_operations_routing_id_routing_tables FOREIGN KEY(routing_id) REFERENCES routing_tables (id) ON DELETE CASCADE, 
	CONSTRAINT fk_routing_operations_vendor_id_vendors FOREIGN KEY(vendor_id) REFERENCES vendors (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_routing_operations_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # routing_operations:ix_routing_operations_routing_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_routing_operations_routing_id ON routing_operations (routing_id)
    """)

    # routing_operations:ix_routing_operations_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_routing_operations_tenantId" ON routing_operations ("tenantId")
    """)

    # routing_operations:ix_routing_operations_vendor_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_routing_operations_vendor_id ON routing_operations (vendor_id)
    """)

    # work_orders
    op.execute("""
CREATE TABLE IF NOT EXISTS work_orders (
	id SERIAL NOT NULL, 
	wo_number VARCHAR(50) NOT NULL, 
	mbom_id INTEGER, 
	sales_order_number VARCHAR(50), 
	customer_name VARCHAR(255), 
	quantity_ordered INTEGER NOT NULL, 
	quantity_completed INTEGER, 
	quantity_scrapped INTEGER, 
	status VARCHAR(50), 
	priority VARCHAR(50), 
	due_date DATE, 
	start_date DATE, 
	completed_date DATE, 
	assigned_to INTEGER, 
	assigned_team_id INTEGER, 
	work_center VARCHAR(100), 
	notes TEXT, 
	extra_data JSON, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_work_orders PRIMARY KEY (id), 
	CONSTRAINT uq_work_orders_tenant_wo_number UNIQUE ("tenantId", wo_number), 
	CONSTRAINT ck_work_orders_ck_work_orders_status CHECK (status IN ('draft', 'released', 'in_progress', 'completed', 'closed', 'cancelled', 'on_hold', 'scrapped')), 
	CONSTRAINT ck_work_orders_ck_work_orders_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')), 
	CONSTRAINT fk_work_orders_mbom_id_mbom_headers FOREIGN KEY(mbom_id) REFERENCES mbom_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_work_orders_assigned_to_users FOREIGN KEY(assigned_to) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_work_orders_assigned_team_id_teams FOREIGN KEY(assigned_team_id) REFERENCES teams (id) ON DELETE SET NULL, 
	CONSTRAINT "fk_work_orders_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # work_orders:idx_work_orders_status_due
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_work_orders_status_due ON work_orders (status, due_date)
    """)

    # work_orders:idx_work_orders_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_status ON work_orders ("tenantId", status)
    """)

    # work_orders:ix_work_orders_assigned_team_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_work_orders_assigned_team_id ON work_orders (assigned_team_id)
    """)

    # work_orders:ix_work_orders_assigned_to
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_work_orders_assigned_to ON work_orders (assigned_to)
    """)

    # work_orders:ix_work_orders_mbom_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_work_orders_mbom_id ON work_orders (mbom_id)
    """)

    # work_orders:ix_work_orders_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_work_orders_tenantId" ON work_orders ("tenantId")
    """)

    # work_orders:ix_work_orders_wo_number
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_work_orders_wo_number ON work_orders (wo_number)
    """)

    # deviation_attachments
    op.execute("""
CREATE TABLE IF NOT EXISTS deviation_attachments (
	id SERIAL NOT NULL, 
	deviation_id INTEGER NOT NULL, 
	filename VARCHAR(255), 
	file_url TEXT, 
	file_type VARCHAR(50), 
	file_size INTEGER, 
	uploaded_by INTEGER, 
	description TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_deviation_attachments PRIMARY KEY (id), 
	CONSTRAINT fk_deviation_attachments_deviation_id_deviations FOREIGN KEY(deviation_id) REFERENCES deviations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_deviation_attachments_uploaded_by_users FOREIGN KEY(uploaded_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_deviation_attachments_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # deviation_attachments:ix_deviation_attachments_deviation_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_deviation_attachments_deviation_id ON deviation_attachments (deviation_id)
    """)

    # deviation_attachments:ix_deviation_attachments_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_deviation_attachments_tenantId" ON deviation_attachments ("tenantId")
    """)

    # deviation_attachments:ix_deviation_attachments_uploaded_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_deviation_attachments_uploaded_by ON deviation_attachments (uploaded_by)
    """)

    # ncr_reports
    op.execute("""
CREATE TABLE IF NOT EXISTS ncr_reports (
	id SERIAL NOT NULL, 
	ncr_number VARCHAR(50) NOT NULL, 
	part_id INTEGER NOT NULL, 
	inspection_record_id INTEGER, 
	defect_description TEXT NOT NULL, 
	defect_category VARCHAR(50) NOT NULL, 
	severity VARCHAR(50) NOT NULL, 
	detected_by INTEGER, 
	detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	detected_stage VARCHAR(50), 
	disposition VARCHAR(50), 
	disposition_by INTEGER, 
	disposition_at TIMESTAMP WITH TIME ZONE, 
	root_cause TEXT, 
	corrective_action TEXT, 
	preventive_action TEXT, 
	verified_by INTEGER, 
	verified_at TIMESTAMP WITH TIME ZONE, 
	status VARCHAR(50), 
	target_close_date DATE, 
	actual_close_date DATE, 
	cost_of_poor_quality NUMERIC(10, 2), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_ncr_reports PRIMARY KEY (id), 
	CONSTRAINT uq_ncr_reports_tenant_ncr_number UNIQUE ("tenantId", ncr_number), 
	CONSTRAINT ck_ncr_reports_ck_ncr_reports_severity CHECK (severity IN ('minor', 'major', 'critical')), 
	CONSTRAINT ck_ncr_reports_ck_ncr_reports_disposition CHECK (disposition IN ('use_as_is', 'rework', 'scrap', 'return_to_vendor')), 
	CONSTRAINT ck_ncr_reports_ck_ncr_reports_status CHECK (status IN ('open', 'in_progress', 'closed', 'verified')), 
	CONSTRAINT fk_ncr_reports_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_ncr_reports_inspection_record_id_inspection_records FOREIGN KEY(inspection_record_id) REFERENCES inspection_records (id) ON DELETE CASCADE, 
	CONSTRAINT fk_ncr_reports_detected_by_users FOREIGN KEY(detected_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_ncr_reports_disposition_by_users FOREIGN KEY(disposition_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_ncr_reports_verified_by_users FOREIGN KEY(verified_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_ncr_reports_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # ncr_reports:idx_ncr_reports_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_ncr_reports_tenant_status ON ncr_reports ("tenantId", status)
    """)

    # ncr_reports:ix_ncr_reports_detected_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_ncr_reports_detected_by ON ncr_reports (detected_by)
    """)

    # ncr_reports:ix_ncr_reports_disposition_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_ncr_reports_disposition_by ON ncr_reports (disposition_by)
    """)

    # ncr_reports:ix_ncr_reports_inspection_record_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_ncr_reports_inspection_record_id ON ncr_reports (inspection_record_id)
    """)

    # ncr_reports:ix_ncr_reports_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_ncr_reports_part_id ON ncr_reports (part_id)
    """)

    # ncr_reports:ix_ncr_reports_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_ncr_reports_tenantId" ON ncr_reports ("tenantId")
    """)

    # ncr_reports:ix_ncr_reports_verified_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_ncr_reports_verified_by ON ncr_reports (verified_by)
    """)

    # resource_schedules
    op.execute("""
CREATE TABLE IF NOT EXISTS resource_schedules (
	id SERIAL NOT NULL, 
	work_center_id INTEGER NOT NULL, 
	work_order_id INTEGER, 
	operation_name VARCHAR(255), 
	scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL, 
	start_time TIMESTAMP WITH TIME ZONE, 
	end_time TIMESTAMP WITH TIME ZONE, 
	planned_hours NUMERIC(5, 2), 
	actual_hours NUMERIC(5, 2), 
	status VARCHAR(50), 
	priority INTEGER, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_resource_schedules PRIMARY KEY (id), 
	CONSTRAINT ck_resource_schedules_ck_resource_schedules_status CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')), 
	CONSTRAINT fk_resource_schedules_work_center_id_work_centers FOREIGN KEY(work_center_id) REFERENCES work_centers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_resource_schedules_work_order_id_work_orders FOREIGN KEY(work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_resource_schedules_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # resource_schedules:idx_resource_schedules_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_resource_schedules_tenant_status ON resource_schedules ("tenantId", status)
    """)

    # resource_schedules:ix_resource_schedules_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_resource_schedules_tenantId" ON resource_schedules ("tenantId")
    """)

    # resource_schedules:ix_resource_schedules_work_center_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_resource_schedules_work_center_id ON resource_schedules (work_center_id)
    """)

    # resource_schedules:ix_resource_schedules_work_order_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_resource_schedules_work_order_id ON resource_schedules (work_order_id)
    """)

    # work_order_materials
    op.execute("""
CREATE TABLE IF NOT EXISTS work_order_materials (
	id SERIAL NOT NULL, 
	work_order_id INTEGER NOT NULL, 
	part_id INTEGER NOT NULL, 
	quantity_required NUMERIC(10, 4), 
	quantity_issued NUMERIC(10, 4), 
	quantity_returned NUMERIC(10, 4), 
	unit VARCHAR(20), 
	issue_status VARCHAR(50), 
	issued_at TIMESTAMP WITH TIME ZONE, 
	issued_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_work_order_materials PRIMARY KEY (id), 
	CONSTRAINT fk_work_order_materials_work_order_id_work_orders FOREIGN KEY(work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE, 
	CONSTRAINT fk_work_order_materials_part_id_parts FOREIGN KEY(part_id) REFERENCES parts (id) ON DELETE CASCADE, 
	CONSTRAINT fk_work_order_materials_issued_by_users FOREIGN KEY(issued_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_work_order_materials_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # work_order_materials:ix_work_order_materials_issued_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_work_order_materials_issued_by ON work_order_materials (issued_by)
    """)

    # work_order_materials:ix_work_order_materials_part_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_work_order_materials_part_id ON work_order_materials (part_id)
    """)

    # work_order_materials:ix_work_order_materials_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_work_order_materials_tenantId" ON work_order_materials ("tenantId")
    """)

    # work_order_materials:ix_work_order_materials_work_order_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_work_order_materials_work_order_id ON work_order_materials (work_order_id)
    """)

    # work_order_operations
    op.execute("""
CREATE TABLE IF NOT EXISTS work_order_operations (
	id SERIAL NOT NULL, 
	work_order_id INTEGER NOT NULL, 
	operation_number INTEGER NOT NULL, 
	operation_name VARCHAR(255) NOT NULL, 
	work_center VARCHAR(100), 
	status VARCHAR(50), 
	planned_setup_time INTERVAL, 
	actual_setup_time INTERVAL, 
	planned_run_time INTERVAL, 
	actual_run_time INTERVAL, 
	quantity_good INTEGER, 
	quantity_scrapped INTEGER, 
	employee_id INTEGER, 
	start_time TIMESTAMP WITH TIME ZONE, 
	end_time TIMESTAMP WITH TIME ZONE, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_work_order_operations PRIMARY KEY (id), 
	CONSTRAINT ck_work_order_operations_ck_work_order_operations_status CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')), 
	CONSTRAINT fk_work_order_operations_work_order_id_work_orders FOREIGN KEY(work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_work_order_operations_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # work_order_operations:idx_work_order_operations_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_work_order_operations_tenant_status ON work_order_operations ("tenantId", status)
    """)

    # work_order_operations:ix_work_order_operations_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_work_order_operations_tenantId" ON work_order_operations ("tenantId")
    """)

    # work_order_operations:ix_work_order_operations_work_order_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_work_order_operations_work_order_id ON work_order_operations (work_order_id)
    """)

    # capa_actions
    op.execute("""
CREATE TABLE IF NOT EXISTS capa_actions (
	id SERIAL NOT NULL, 
	capa_number VARCHAR(50) NOT NULL, 
	ncr_id INTEGER, 
	eco_id INTEGER, 
	action_type VARCHAR(50) NOT NULL, 
	description TEXT NOT NULL, 
	assigned_to INTEGER, 
	assigned_team_id INTEGER, 
	due_date DATE, 
	status VARCHAR(50), 
	completed_at TIMESTAMP WITH TIME ZONE, 
	verified_by INTEGER, 
	verified_at TIMESTAMP WITH TIME ZONE, 
	effectiveness_notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_capa_actions PRIMARY KEY (id), 
	CONSTRAINT uq_capa_actions_tenant_capa_number UNIQUE ("tenantId", capa_number), 
	CONSTRAINT ck_capa_actions_ck_capa_actions_action_type CHECK (action_type IN ('corrective', 'preventive')), 
	CONSTRAINT ck_capa_actions_ck_capa_actions_status CHECK (status IN ('open', 'in_progress', 'pending_verification', 'closed')), 
	CONSTRAINT fk_capa_actions_ncr_id_ncr_reports FOREIGN KEY(ncr_id) REFERENCES ncr_reports (id) ON DELETE CASCADE, 
	CONSTRAINT fk_capa_actions_eco_id_eco_headers FOREIGN KEY(eco_id) REFERENCES eco_headers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_capa_actions_assigned_to_users FOREIGN KEY(assigned_to) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT fk_capa_actions_assigned_team_id_teams FOREIGN KEY(assigned_team_id) REFERENCES teams (id) ON DELETE SET NULL, 
	CONSTRAINT fk_capa_actions_verified_by_users FOREIGN KEY(verified_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_capa_actions_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # capa_actions:idx_capa_actions_tenant_status
    op.execute("""
CREATE INDEX IF NOT EXISTS idx_capa_actions_tenant_status ON capa_actions ("tenantId", status)
    """)

    # capa_actions:ix_capa_actions_assigned_team_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_capa_actions_assigned_team_id ON capa_actions (assigned_team_id)
    """)

    # capa_actions:ix_capa_actions_assigned_to
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_capa_actions_assigned_to ON capa_actions (assigned_to)
    """)

    # capa_actions:ix_capa_actions_eco_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_capa_actions_eco_id ON capa_actions (eco_id)
    """)

    # capa_actions:ix_capa_actions_ncr_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_capa_actions_ncr_id ON capa_actions (ncr_id)
    """)

    # capa_actions:ix_capa_actions_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_capa_actions_tenantId" ON capa_actions ("tenantId")
    """)

    # capa_actions:ix_capa_actions_verified_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_capa_actions_verified_by ON capa_actions (verified_by)
    """)

    # timesheet_entries
    op.execute("""
CREATE TABLE IF NOT EXISTS timesheet_entries (
	id SERIAL NOT NULL, 
	employee_id VARCHAR(50) NOT NULL, 
	work_order_id INTEGER, 
	work_order_operation_id INTEGER, 
	work_center_id INTEGER, 
	date TIMESTAMP WITH TIME ZONE NOT NULL, 
	hours_worked NUMERIC(5, 2) NOT NULL, 
	is_overtime BOOLEAN, 
	activity_type VARCHAR(50), 
	description TEXT, 
	approved BOOLEAN, 
	approved_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	"tenantId" INTEGER NOT NULL, 
	CONSTRAINT pk_timesheet_entries PRIMARY KEY (id), 
	CONSTRAINT fk_timesheet_entries_work_order_id_work_orders FOREIGN KEY(work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE, 
	CONSTRAINT fk_timesheet_entries_work_order_operation_id_work_order_9a03 FOREIGN KEY(work_order_operation_id) REFERENCES work_order_operations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_timesheet_entries_work_center_id_work_centers FOREIGN KEY(work_center_id) REFERENCES work_centers (id) ON DELETE CASCADE, 
	CONSTRAINT fk_timesheet_entries_approved_by_users FOREIGN KEY(approved_by) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT "fk_timesheet_entries_tenantId_tenants" FOREIGN KEY("tenantId") REFERENCES tenants (id) ON DELETE CASCADE
)
    """)

    # timesheet_entries:ix_timesheet_entries_approved_by
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_timesheet_entries_approved_by ON timesheet_entries (approved_by)
    """)

    # timesheet_entries:ix_timesheet_entries_tenantId
    op.execute("""
CREATE INDEX IF NOT EXISTS "ix_timesheet_entries_tenantId" ON timesheet_entries ("tenantId")
    """)

    # timesheet_entries:ix_timesheet_entries_work_center_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_timesheet_entries_work_center_id ON timesheet_entries (work_center_id)
    """)

    # timesheet_entries:ix_timesheet_entries_work_order_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_timesheet_entries_work_order_id ON timesheet_entries (work_order_id)
    """)

    # timesheet_entries:ix_timesheet_entries_work_order_operation_id
    op.execute("""
CREATE INDEX IF NOT EXISTS ix_timesheet_entries_work_order_operation_id ON timesheet_entries (work_order_operation_id)
    """)


def downgrade() -> None:
    """Deliberately refuses to run. This migration has no safe inverse.

    upgrade() is a NO-OP on every existing database: every statement is
    CREATE TABLE IF NOT EXISTS, and each of these 74 tables already exists on
    any database bootstrapped by scripts.init_db (which is all of them). So
    this migration did not CREATE those tables — it only recorded them in the
    alembic chain.

    A literal inverse would therefore drop 74 tables it never created, with
    live data in them: tenants, roles, permissions, user_roles, user_sessions,
    api_keys, inventory, inventory_transactions, po_headers, work_orders,
    eco_headers, notifications, bom_snapshots and 61 more. Worse, dropping
    `tenants` CASCADE also strips the tenantId foreign key from ~90 surviving
    tables (parts, boms, documents, ...), and re-running upgrade() would NOT
    put them back — an up/down/up cycle would leave the schema permanently
    degraded even after restoring rows from backup.

    That mattered because backend/docs/deployment-runbook.md documents
    `alembic downgrade -1` as the standard application-rollback step, which
    resolves to exactly this revision once it is head. An operator following
    the runbook during an incident would have destroyed the database.

    To roll the application back past this revision, stamp instead of
    downgrade — the schema needs no change, only the version marker:

        alembic stamp 058_calendar_events
    """
    raise NotImplementedError(
        "059_formalize_create_all_tables has no safe downgrade: its upgrade is "
        "a no-op on existing databases, so reversing it would DROP 74 live "
        "tables (including tenants, CASCADE) that it never created. To move the "
        "version marker back without touching the schema, run: "
        "alembic stamp 058_calendar_events"
    )

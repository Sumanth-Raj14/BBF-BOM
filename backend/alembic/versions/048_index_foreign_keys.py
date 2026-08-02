"""Index every foreign-key column (audit improvement #6).

30 FK columns had no index. That costs twice:
  * joins across them fall back to sequential scans -- including
    bom_closures.ancestor_item_id / descendant_item_id, which the BOM
    explosion and where-used queries join on for every lookup;
  * deleting a parent row makes Postgres scan the whole child table to
    enforce the constraint, and 28 of these are ON DELETE CASCADE/SET NULL,
    so the scan happens on every such delete.

Eight of them already declared index=True on the model but were missing from
the database -- migrated schemas had drifted from what create_all() builds.
Index names therefore match SQLAlchemy's default (ix_<table>_<column>) so a
migrated database and a fresh create_all() one stay byte-identical, which the
fresh-install CI job asserts.

Revision ID: 048_index_foreign_keys
Revises: 047_solidworks_integration
"""

from alembic import op
from sqlalchemy import inspect

revision = "048_index_foreign_keys"
down_revision = "047_solidworks_integration"
branch_labels = None
depends_on = None

# (table, column) -- every FK column found without a supporting index.
FK_COLUMNS = [
    ("bom_closures", "ancestor_item_id"),
    ("bom_closures", "descendant_item_id"),
    ("compliance_evaluations", "applied_exemption_id"),
    ("compliance_evaluations", "bom_id"),
    ("compliance_evaluations", "driving_child_part_id"),
    ("compliance_evaluations", "driving_substance_id"),
    ("compliance_pack_items", "pack_id"),
    ("compliance_packs", "standard_id"),
    ("exemption_claims", "part_material_id"),
    ("exemption_claims", "source_declaration_id"),
    ("exemption_claims", "substance_group_id"),
    ("exemption_claims", "substance_id"),
    ("part_certifications", "compliance_id"),
    ("part_certifications", "part_id"),
    ("part_material_substances", "source_declaration_id"),
    ("reach_obligations", "article_part_id"),
    ("reach_obligations", "bom_id"),
    ("reach_obligations", "regulation_version_id"),
    ("reach_obligations", "substance_id"),
    ("restricted_substance_entries", "substance_group_id"),
    ("restricted_substance_entries", "substance_id"),
    ("rfq_headers", "awarded_to_vendor_id"),
    ("rfq_headers", "created_by"),
    ("rfq_supplier_responses", "line_item_id"),
    ("rfq_supplier_responses", "supplier_user_id"),
    ("rohs_exemptions", "substance_group_id"),
    ("rohs_exemptions", "substance_id"),
    ("substance_declarations", "approved_by"),
    ("substance_declarations", "assessed_regulation_version_id"),
    ("substance_declarations", "supplier_id"),
]


def upgrade():
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    for table, column in FK_COLUMNS:
        if table not in existing:
            # Tolerate partially-provisioned schemas rather than aborting the
            # whole upgrade on one absent table.
            continue
        op.execute(
            f'CREATE INDEX IF NOT EXISTS ix_{table}_{column} '
            f'ON {table} ("{column}")'
        )


def downgrade():
    for table, column in FK_COLUMNS:
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_{column}")

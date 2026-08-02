"""Every foreign-key column must have a supporting index (improvement #6).

An unindexed FK costs twice: joins across it fall back to sequential scans,
and deleting a parent row makes Postgres scan the whole child table to enforce
the constraint — which matters here because 388 of the 411 FKs are ON DELETE
CASCADE. 30 columns were unindexed when this was measured, including
bom_closures.ancestor_item_id / descendant_item_id, which the BOM explosion
and where-used queries join on for every lookup.

Asserted against the ORM metadata so it holds for BOTH provisioning paths:
create_all (fresh install) and the migration chain.
"""

import app.models  # noqa: F401 — register every model on the metadata
from app.db.base import Base


def _indexed_first_columns(table):
    """Columns that lead an index (or a PK/unique constraint) on this table."""
    leading = set()
    for ix in table.indexes:
        cols = list(ix.columns)
        if cols:
            leading.add(cols[0].name)
    for col in table.primary_key.columns:
        leading.add(col.name)
    for c in table.constraints:
        cols = list(getattr(c, "columns", []) or [])
        if cols:
            leading.add(cols[0].name)
    return leading


def test_every_foreign_key_column_is_indexed():
    unindexed = []
    for table in Base.metadata.tables.values():
        leading = _indexed_first_columns(table)
        for fk in table.foreign_keys:
            col = fk.parent.name
            if col not in leading:
                unindexed.append(f"{table.name}.{col}")
    assert not unindexed, (
        "Foreign-key columns without a supporting index "
        f"({len(unindexed)}): {sorted(unindexed)}. Add index=True to the "
        "Column and a CREATE INDEX to a migration (see 048_index_foreign_keys)."
    )

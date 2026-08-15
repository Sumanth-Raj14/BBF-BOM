"""Audit CHECK-constraint drift between the ORM models and a live database.

WHY
---
`scripts/init_db.py` bootstraps a greenfield database with
`Base.metadata.create_all()`, which materialises every CHECK the models
declare. Long-lived databases instead arrive at their schema through the
Alembic chain, and most of those migrations never added the CHECKs. The result
is two different schemas from one codebase: a fresh install rejects data that
an upgraded one silently accepts.

This was found the hard way — a seed fixture using `category='Fabricated'`
passed against the dev database and failed on CI's fresh schema.

WHAT IT DOES
------------
For every CHECK the models declare, reports whether the live database has it
and, if not, how many existing rows would VIOLATE it. That distinction is the
whole point:

  * 0 violations  -> safe to add in a migration right now.
  * N violations  -> the data must be cleaned first; adding the constraint
                     would abort the migration.

A CHECK passes when it evaluates to TRUE **or NULL**, so violations are counted
as `WHERE (expr) IS FALSE` — counting `NOT (expr)` would wrongly flag every
NULL.

Read-only: issues no DDL and writes nothing.

    python -m scripts.audit_check_constraints
"""

import asyncio
import re

from sqlalchemy import text

from app.db.session import get_session_maker

import app.models  # noqa: F401 — register every model
from app.db.base import Base


def model_checks():
    """(table, name, sql) for every CHECK the models declare."""
    out = []
    for table in Base.metadata.tables.values():
        for c in table.constraints:
            if type(c).__name__ != "CheckConstraint":
                continue
            out.append((table.name, c.name or "<unnamed>", str(c.sqltext)))
    return sorted(out)


async def live_state(db):
    rows = (
        await db.execute(
            text(
                """
                SELECT t.relname, c.conname, pg_get_constraintdef(c.oid)
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE c.contype = 'c' AND n.nspname = 'public'
                """
            )
        )
    ).all()
    by_table = {}
    for tbl, name, definition in rows:
        by_table.setdefault(tbl, []).append((name, definition))
    return by_table


async def main():
    Session = await get_session_maker()
    async with Session() as db:
        present = await live_state(db)
        live_tables = {
            r[0]
            for r in (
                await db.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema='public'"
                    )
                )
            ).all()
        }

        declared = model_checks()
        missing_clean, missing_dirty, unverifiable, already = [], [], [], []

        for tbl, name, sql in declared:
            if tbl not in live_tables:
                continue
            names = {n for n, _ in present.get(tbl, [])}
            if name in names:
                already.append((tbl, name))
                continue

            # Would any existing row violate it? NULL is not a violation.
            try:
                n = (
                    await db.execute(
                        text(f'SELECT count(*) FROM "{tbl}" WHERE ({sql}) IS FALSE')
                    )
                ).scalar()
            except Exception as e:  # noqa: BLE001 — report, never abort the audit
                await db.rollback()
                reason = re.sub(r"\s+", " ", str(e))[:90]
                unverifiable.append((tbl, name, reason))
                continue

            (missing_clean if n == 0 else missing_dirty).append((tbl, name, n))

        print(f"CHECK constraints declared by the models : {len(declared)}")
        print(f"  already present in the database        : {len(already)}")
        print(f"  MISSING, 0 violating rows (safe to add): {len(missing_clean)}")
        print(f"  MISSING, data violates it (clean first): {len(missing_dirty)}")
        print(f"  could not be evaluated                 : {len(unverifiable)}")

        if missing_dirty:
            print("\n-- BLOCKED: existing rows violate these --")
            for tbl, name, n in sorted(missing_dirty, key=lambda r: -r[2]):
                print(f"   {n:>6} row(s)  {tbl}.{name}")

        if unverifiable:
            print("\n-- could not evaluate (reported, not assumed safe) --")
            for tbl, name, reason in unverifiable[:15]:
                print(f"   {tbl}.{name}: {reason}")
            if len(unverifiable) > 15:
                print(f"   ... and {len(unverifiable) - 15} more")


if __name__ == "__main__":
    asyncio.run(main())

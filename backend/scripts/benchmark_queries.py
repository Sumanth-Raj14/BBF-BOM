"""Count SQL round-trips per operation, and fail when one scales with row count.

Why this exists, and why benchmark_bom.py could not do it: that script runs
against `sqlite+aiosqlite:///:memory:`, where a query costs microseconds and
never leaves the process. N+1 is invisible there by construction — 1 query and
501 queries both look instant, so the benchmark reported healthy timings for
code that issues a query per BOM line.

Counting selectinload/joinedload alone understates this codebase: only 1 of 30
service modules uses them, but 10 more batch relationships manually with
`Part.id.in_(ids)`, which is scale-invariant too. Static grepping for an idiom
therefore cannot answer the question — hence measuring round-trips instead.

This measures the metric that actually predicts production behaviour: the NUMBER
of round-trips, which is what a real network multiplies by real latency. It is
latency-independent, so it gives the same verdict on SQLite as on Postgres —
though it defaults to Postgres because that is what deployments run.

The test is scale-invariance, not an absolute count: run the same operation at
two sizes and assert the query count does not grow with the data. A count that
tracks row count IS the N+1, whatever its constant factor.

    python -m scripts.benchmark_queries                  # Postgres from env
    TEST_DATABASE_URL=sqlite+aiosqlite:///./qbench.db python -m scripts.benchmark_queries

Exit code 1 if any operation scales, so CI can gate on it.
"""

import asyncio
import os
import sys
from collections import Counter

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.tenant_context import TenantContext
from app.db.base import Base
from app.models.bom import BOM, BOMItem
from app.models.part import Part
from app.models.tenant import Tenant
from app.models.user import User
from app.services import bom_service


def _db_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        return url
    user = os.environ.get("POSTGRES_USER", "bom_user")
    pw = os.environ.get("POSTGRES_PASSWORD", "bom_test_password")
    host = os.environ.get("POSTGRES_SERVER", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5433")
    db = os.environ.get("POSTGRES_DB", "bom_test_db")
    return f"postgresql+asyncpg://{user}:{pw}@{host}:{port}/{db}"


class QueryCounter:
    """Count statements issued on an engine, bucketed by leading keyword."""

    def __init__(self, engine):
        self._sync = engine.sync_engine
        self.by_kind: Counter = Counter()
        self.total = 0
        self._hook = None

    def __enter__(self):
        def before(conn, cursor, statement, params, context, executemany):
            self.total += 1
            self.by_kind[statement.strip().split(None, 1)[0].upper()] += 1

        self._hook = before
        event.listen(self._sync, "before_cursor_execute", before)
        return self

    def __exit__(self, *exc):
        event.remove(self._sync, "before_cursor_execute", self._hook)
        return False


async def _seed(session: AsyncSession, tenant_id: int, user_id: int, n_lines: int) -> int:
    """One BOM with n_lines distinct parts. Returns the bom id."""
    bom = BOM(
        tenantId=tenant_id,
        bom_number=f"QB-BOM-{n_lines}",  # NOT NULL
        name=f"QBench BOM {n_lines}",
        created_by=user_id,
    )
    session.add(bom)
    await session.flush()

    parts = [
        Part(tenantId=tenant_id, pn=f"QB-{n_lines}-{i}", name=f"Part {i}")
        for i in range(n_lines)
    ]
    session.add_all(parts)
    await session.flush()

    session.add_all(
        [
            BOMItem(
                tenantId=tenant_id,
                bom_id=bom.id,
                part_id=p.id,
                quantity=1,
                sort_order=i,
            )
            for i, p in enumerate(parts)
        ]
    )
    await session.commit()
    return bom.id


async def _read_bom_lines(session: AsyncSession, bom_id: int) -> int:
    """The REAL read path: bom_service.list_bom_items.

    Deliberately the shipped function, not a hand-written loop. An earlier draft
    of this script iterated `session.get(Part, ...)` itself, which is N+1 by
    construction — it would have failed on every codebase and proved nothing
    about this one. The question is whether the code that actually serves BOM
    reads scales, so the benchmark has to call that code.
    """
    rows = await bom_service.list_bom_items(session, bom_id)
    return len(rows)


async def main() -> int:
    url = _db_url()
    print(f"database: {url.split('@')[-1] if '@' in url else url}")
    engine = create_async_engine(url, echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    results = {}
    tctx = None
    try:
        # list_bom_items scopes on get_tenant_id(); without a context it runs
        # unfiltered, which is not the query shape production issues.
        async with maker() as s:
            tenant = Tenant(tenant_name="QBench", tenant_code="qbench")
            s.add(tenant)
            await s.flush()
            user = User(
                tenantId=tenant.id,
                email="qbench@example.invalid",
                username="qbench",
                hashedPassword="x",
                isActive=True,
            )
            s.add(user)
            await s.commit()
            tenant_id, user_id = tenant.id, user.id
        tctx = TenantContext.set(tenant_id)

        for size in (10, 100):
            async with maker() as s:
                bom_id = await _seed(s, tenant_id, user_id, size)

            # Fresh session: a warm identity map would serve parts from memory
            # and hide the very round-trips being counted.
            async with maker() as s:
                with QueryCounter(engine) as qc:
                    touched = await _read_bom_lines(s, bom_id)
            assert touched == size, f"seed/read mismatch: {touched} != {size}"
            results[size] = qc.total
            print(f"  {size:4} lines -> {qc.total:5} queries   {dict(qc.by_kind)}")
    finally:
        if tctx is not None:
            TenantContext.reset(tctx)
        await engine.dispose()

    small, large = results[10], results[100]
    growth = (large - small) / 90.0  # extra queries per extra line

    print()
    print(f"queries at 10 lines : {small}")
    print(f"queries at 100 lines: {large}")
    print(f"growth per line     : {growth:.2f}")
    print()

    # A scale-invariant read adds ~0 queries per line. Anything at or near 1.0
    # is one query per row.
    if growth > 0.5:
        print(
            "FAIL: query count scales with row count — this is an N+1.\n"
            "      A 5,000-line BOM issues ~5,000 round-trips; at 1 ms of network\n"
            "      latency that is 5 s of pure waiting, and the in-memory-SQLite\n"
            "      benchmark cannot see it.\n"
            "      Fix: selectinload() the relationship in the service that reads it."
        )
        return 1

    print("OK: read is scale-invariant (no N+1 on this path).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

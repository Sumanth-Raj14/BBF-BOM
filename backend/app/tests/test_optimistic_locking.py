"""Lost-update protection on the concurrently-edited tables.

The bug this pins: every write path on parts / bom_items / bom_templates was a
read-modify-write with no guard. Two engineers editing one BOM line both read
qty=10; one saved 12, the other saved 15, and the 12 was silently gone. Neither
user was told anything, so the loser had no way to notice their work vanished.

These tests drive two SEPARATE sessions, because that is the only way to
reproduce it — a single session sees its own pending state and never races.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm.exc import StaleDataError

from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.part import Part


@pytest_asyncio.fixture
async def sessions(test_engine):
    """A factory for INDEPENDENT sessions on the same database.

    conftest's `db_session` is a single session; a lost update cannot be
    reproduced inside one, because it sees its own pending state and never
    races. Each call here is a separate identity map and transaction, which is
    what two concurrent HTTP requests really are.
    """
    return async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


def _mapper_versioned(model) -> bool:
    from sqlalchemy import inspect

    col = inspect(model).version_id_col
    return col is not None and col.name == "lock_version"


def test_all_three_models_are_versioned():
    """Guard the guard: if the mixin comes off a model, every test below is moot
    because an unversioned UPDATE simply succeeds."""
    for model in (Part, BomItem, BomTemplate):
        assert _mapper_versioned(model), f"{model.__name__} lost its version_id_col"


@pytest.mark.asyncio
async def test_concurrent_part_update_raises_stale_data(sessions, test_tenant):
    """The second writer must LOSE, not silently win."""
    tenant_id = test_tenant.id

    async with sessions() as setup:
        part = Part(tenantId=tenant_id, pn="LOCK-1", name="Contended part")
        setup.add(part)
        await setup.commit()
        await setup.refresh(part)
        part_id = part.id
        assert part.lock_version == 1, "a fresh row must start at version 1"

    # Two users open the same part. Both reads happen BEFORE either write.
    async with sessions() as s_a, sessions() as s_b:
        a = (await s_a.execute(select(Part).where(Part.id == part_id))).scalar_one()
        b = (await s_b.execute(select(Part).where(Part.id == part_id))).scalar_one()
        assert a.lock_version == b.lock_version == 1

        # User A saves first and wins.
        a.name = "Renamed by A"
        await s_a.commit()

        # User B saves the value they read a moment ago. Before this change B's
        # write landed and erased A's edit with no error. Now it must fail.
        b.name = "Renamed by B"
        with pytest.raises(StaleDataError):
            await s_b.commit()

    # A's write survived; B's was rejected rather than applied.
    async with sessions() as check:
        row = (await check.execute(select(Part).where(Part.id == part_id))).scalar_one()
        assert row.name == "Renamed by A"
        assert row.lock_version == 2, "the winning write must bump the version exactly once"


@pytest.mark.asyncio
async def test_sequential_updates_still_work(sessions, test_tenant):
    """Optimistic locking must not break the ordinary single-editor case — the
    obvious way to 'fix' a conflict bug is to make every second save fail."""
    tenant_id = test_tenant.id

    async with sessions() as s:
        part = Part(tenantId=tenant_id, pn="LOCK-2", name="v1")
        s.add(part)
        await s.commit()
        await s.refresh(part)
        pid = part.id

    for i in range(2, 5):
        async with sessions() as s:
            row = (await s.execute(select(Part).where(Part.id == pid))).scalar_one()
            row.name = f"v{i}"
            await s.commit()  # each re-reads first, so none of these may conflict

    async with sessions() as s:
        row = (await s.execute(select(Part).where(Part.id == pid))).scalar_one()
        assert row.name == "v4"
        assert row.lock_version == 4, "three successful updates over version 1"


@pytest.mark.asyncio
async def test_concurrent_bom_item_quantity_update(sessions, test_tenant, test_user):
    """The scenario from the bug report, on the row it actually happens to: two
    people editing one BOM line's quantity."""
    tenant_id = test_tenant.id

    async with sessions() as s:
        # createdById is NOT NULL on bom_templates.
        tmpl = BomTemplate(
            tenantId=tenant_id, name="Contended BOM", createdById=test_user.id
        )
        part = Part(tenantId=tenant_id, pn="LOCK-3", name="Line part")
        s.add_all([tmpl, part])
        await s.commit()
        await s.refresh(tmpl)
        await s.refresh(part)
        item = BomItem(
            tenantId=tenant_id, bomTemplateId=tmpl.id, partId=part.id, quantity=10
        )
        s.add(item)
        await s.commit()
        await s.refresh(item)
        item_id = item.id

    async with sessions() as s_a, sessions() as s_b:
        a = (await s_a.execute(select(BomItem).where(BomItem.id == item_id))).scalar_one()
        b = (await s_b.execute(select(BomItem).where(BomItem.id == item_id))).scalar_one()

        a.quantity = 12
        await s_a.commit()

        b.quantity = 15
        with pytest.raises(StaleDataError):
            await s_b.commit()

    async with sessions() as s:
        row = (await s.execute(select(BomItem).where(BomItem.id == item_id))).scalar_one()
        assert int(row.quantity) == 12, "A's quantity must stand; B's must not overwrite it"


@pytest.mark.asyncio
async def test_concurrent_delete_and_update_conflict(sessions, test_tenant):
    """Deleting a row someone else already changed must also be caught — the
    version guard is appended to DELETE, not only UPDATE."""
    tenant_id = test_tenant.id

    async with sessions() as s:
        part = Part(tenantId=tenant_id, pn="LOCK-4", name="To be raced")
        s.add(part)
        await s.commit()
        await s.refresh(part)
        pid = part.id

    async with sessions() as s_a, sessions() as s_b:
        a = (await s_a.execute(select(Part).where(Part.id == pid))).scalar_one()
        b = (await s_b.execute(select(Part).where(Part.id == pid))).scalar_one()

        a.name = "Edited by A"
        await s_a.commit()

        await s_b.delete(b)
        with pytest.raises(StaleDataError):
            await s_b.commit()

    async with sessions() as s:
        row = (await s.execute(select(Part).where(Part.id == pid))).scalar_one_or_none()
        assert row is not None, "the stale DELETE must not have removed the row"

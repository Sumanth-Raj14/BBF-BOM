"""TDD test for bom-integrity findings in bom_service.apply_template /
import_bom (see fix2_bom-integrity.md).

Before the fix: apply_template inserted BOMItem rows in a raw loop that never
called _closure_add_item, so BomClosure had NO self-row for template-applied
items — where-used/explosion via the closure table would silently miss them
forever. import_bom also unconditionally reported import_status == "success"
for a file it never fetched or parsed.
"""

from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.bom_closure import BomClosure
from app.models.bom_item import BomItem as TemplateBomItem
from app.models.bom_template import BomTemplate
from app.models.part import Part
from app.services import bom_service


async def _make_part(db_session, tenant_id, pn):
    part = Part(pn=pn, name=f"Part {pn}", category="Electrical", cost=0.0, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


@pytest.mark.asyncio
async def test_apply_template_writes_bom_closure_self_rows(db_session, test_tenant, test_user):
    tid = test_tenant.id
    part_a = await _make_part(db_session, tid, "PN-TMPL-A")
    part_b = await _make_part(db_session, tid, "PN-TMPL-B")

    tmpl = BomTemplate(name="Closure Template", createdById=test_user.id, tenantId=tid)
    db_session.add(tmpl)
    await db_session.commit()
    await db_session.refresh(tmpl)

    db_session.add_all(
        [
            TemplateBomItem(
                bomTemplateId=tmpl.id, partId=part_a.id, quantity=Decimal("2"), tenantId=tid
            ),
            TemplateBomItem(
                bomTemplateId=tmpl.id, partId=part_b.id, quantity=Decimal("3"), tenantId=tid
            ),
        ]
    )
    await db_session.commit()

    result = await bom_service.apply_template(db_session, tmpl.id, project_id=None)
    assert result["items_created"] == 2

    # bom-integrity finding 1: every created BOMItem must have a BomClosure
    # self-row (depth 0, ancestor == descendant == item_id) — this is what
    # create_bom_item does via _closure_add_item for every other creation path.
    items = (
        await db_session.execute(
            select(bom_service.BOMItem).where(bom_service.BOMItem.bom_id == result["bom_id"])
        )
    ).scalars().all()
    assert len(items) == 2

    for item in items:
        self_row = (
            await db_session.execute(
                select(BomClosure).where(
                    BomClosure.bom_id == result["bom_id"],
                    BomClosure.ancestor_item_id == item.id,
                    BomClosure.descendant_item_id == item.id,
                )
            )
        ).scalar_one_or_none()
        assert self_row is not None, f"item {item.id} missing BomClosure self-row"
        assert self_row.depth == 0


@pytest.mark.asyncio
async def test_import_bom_does_not_claim_success_for_unparsed_file(db_session, test_tenant):
    """The original finding still holds, at the new seam.

    This used to call bom_service.import_bom(file_url=...) and assert it did
    not report "success" — because nothing was ever fetched or parsed, so a
    success status was indistinguishable from a real import.

    import_bom now takes (filename, content) and does real work, and the
    server-side fetch was never implemented, so the equivalent guarantee moved
    to the endpoint: a file_url with no uploaded file is rejected outright
    rather than quietly producing an empty draft BOM. Same intent, new shape.
    """
    # 1. An unparsable payload must FAIL LOUDLY, not report success. The
    #    implementation rejects it with a 400 rather than returning a
    #    non-success dict, which satisfies the original intent more strongly:
    #    a caller cannot mistake it for a completed import at all.
    import pytest as _pytest
    from fastapi import HTTPException

    from app.services import bom_service

    with _pytest.raises(HTTPException) as exc:
        await bom_service.import_bom(
            db_session,
            filename="fake.csv",
            content=b"PK-not-a-real-spreadsheet-body",
            tenant_id=test_tenant.id,
        )
    assert exc.value.status_code == 400

    # 2. A row whose part number does not exist is reported, never invented.
    result2 = await bom_service.import_bom(
        db_session,
        filename="unknown.csv",
        content=(
            b"Level,Part Number,Qty\n"
            b"1,NOPE-DOES-NOT-EXIST,1\n"
        ),
        tenant_id=test_tenant.id,
    )
    assert result2["items_imported"] == 0
    assert result2.get("errors"), "an unmatched part number must be reported as a row error"

"""Export/Reporting endpoints — real XLSX and PDF generation with tenant isolation.

The configurable export contract (POST /export, GET /export/columns,
/export/templates) and the legacy back-compat GET routes both funnel through
app.services.export_service so column/format/filter rules never drift.
"""

import io
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import export_service

router = APIRouter()


def _build_header(ws, headers):
    from openpyxl.styles import Alignment, Font, PatternFill

    header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")


def _auto_width(ws):
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)


def _stream(content: bytes, content_type: str, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(content),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============ Shared export contract ============


class ExportRequest(BaseModel):
    entity: str
    format: str
    bom_id: Optional[int] = None
    columns: Optional[list[str]] = None
    indented: bool = True
    include_sub_assemblies: bool = True
    filters: Optional[dict[str, Any]] = None
    currency: Optional[str] = None
    template_id: Optional[int] = None


class ExportTemplateCreateRequest(BaseModel):
    name: str
    entity: str
    config: dict[str, Any]


async def _resolve_export_params(db: AsyncSession, tenant_id, body: ExportRequest) -> dict:
    """Merge a saved template's config in UNDER whatever the caller explicitly
    set on the request body — explicit fields always win (contract: "template
    supplies any field not given explicitly")."""
    explicit = body.model_fields_set
    params = {
        "entity": body.entity,
        "format": body.format,
        "bom_id": body.bom_id,
        "columns": body.columns,
        "indented": body.indented,
        "include_sub_assemblies": body.include_sub_assemblies,
        "filters": body.filters,
        "currency": body.currency,
    }
    if body.template_id is not None:
        tmpl = await export_service.get_template_or_404(db, tenant_id, body.template_id)
        if tmpl.entity != body.entity:
            raise HTTPException(400, "Template entity does not match requested entity")
        for key, value in (tmpl.config or {}).items():
            if key in params and key not in explicit:
                params[key] = value
    return params


@router.post("")
async def export_entity(
    body: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    params = await _resolve_export_params(db, current_user.tenantId, body)
    content, content_type, filename = await export_service.render_export(
        db, current_user.tenantId, **params
    )
    return _stream(content, content_type, filename)


@router.get("/columns")
async def get_export_columns(
    entity: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    return {"columns": export_service.get_export_columns(entity)}


@router.get("/templates")
async def list_export_templates(
    entity: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    templates = await export_service.list_templates(db, current_user.tenantId, entity)
    return [
        {"id": t.id, "name": t.name, "entity": t.entity, "config": t.config} for t in templates
    ]


@router.post("/templates", status_code=201)
async def create_export_template(
    body: ExportTemplateCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tmpl = await export_service.create_template(
        db, current_user.tenantId, body.name, body.entity, body.config
    )
    return {"id": tmpl.id, "name": tmpl.name, "entity": tmpl.entity, "config": tmpl.config}


@router.delete("/templates/{template_id}", status_code=204)
async def delete_export_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await export_service.delete_template(db, current_user.tenantId, template_id)
    return None


# ============ Back-compat GET routes — now delegate to export_service ============


@router.get("/parts/xlsx")
async def export_parts_xlsx(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content, content_type, filename = await export_service.render_export(
        db, current_user.tenantId, entity="parts", format="xlsx"
    )
    return _stream(content, content_type, "parts_export.xlsx")


@router.get("/parts/pdf")
async def export_parts_pdf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content, content_type, filename = await export_service.render_export(
        db, current_user.tenantId, entity="parts", format="pdf"
    )
    return _stream(content, content_type, "parts_report.pdf")


@router.get("/vendors/xlsx")
async def export_vendors_xlsx(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content, content_type, filename = await export_service.render_export(
        db, current_user.tenantId, entity="vendors", format="xlsx"
    )
    return _stream(content, content_type, "vendors_export.xlsx")


@router.get("/vendors/pdf")
async def export_vendors_pdf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content, content_type, filename = await export_service.render_export(
        db, current_user.tenantId, entity="vendors", format="pdf"
    )
    return _stream(content, content_type, "vendors_report.pdf")


@router.get("/pos/xlsx")
async def export_pos_xlsx(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content, content_type, filename = await export_service.render_export(
        db, current_user.tenantId, entity="purchase_orders", format="xlsx"
    )
    return _stream(content, content_type, "pos_export.xlsx")


@router.get("/summary")
async def export_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenantId
    parts_count = await db.execute(
        text('SELECT COUNT(*) FROM parts WHERE "tenantId" = :tid'), {"tid": tid}
    )
    vendors_count = await db.execute(
        text('SELECT COUNT(*) FROM vendors WHERE "tenantId" = :tid'), {"tid": tid}
    )
    po_count = await db.execute(
        text('SELECT COUNT(*) FROM "po_headers" WHERE "tenantId" = :tid'), {"tid": tid}
    )
    docs_count = await db.execute(
        text('SELECT COUNT(*) FROM documents WHERE "tenantId" = :tid'), {"tid": tid}
    )

    return {
        "reportType": "summary",
        "generatedAt": "2026-06-05",
        "totals": {
            "parts": parts_count.scalar() or 0,
            "vendors": vendors_count.scalar() or 0,
            "purchaseOrders": po_count.scalar() or 0,
            "documents": docs_count.scalar() or 0,
        },
    }


# ============ Legacy BOM-template export (bom_templates + bom_items) ============
#
# NOT the same system as entity="bom" above (which is the canonical BOM/BOMItem
# model, keyed by bom_id). This is the older BomTemplate/BomItem pair, keyed by
# template_id, kept for back-compat. The SQL here previously selected
# pn/name/uom/category/vendor/cost directly off bom_items, which has none of
# those columns (they live on parts, via partId) -- every call 500'd. Fixed to
# join through parts, and now also emits referenceDesignator.


@router.get("/bom/xlsx")
async def export_bom_xlsx(
    template_id: int = Query(..., description="BOM Template ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from openpyxl import Workbook
    from openpyxl.styles import Font

    template = await db.execute(
        text('SELECT * FROM bom_templates WHERE id = :id AND "tenantId" = :tid'),
        {"id": template_id, "tid": current_user.tenantId},
    )
    tmpl = template.mappings().first()
    if not tmpl:
        raise HTTPException(404, "BOM template not found")

    items_result = await db.execute(
        text(
            'SELECT p.pn, p.name, bi.quantity, p.uom, p.category, p.vendor, p.cost, '
            'bi."referenceDesignator" '
            'FROM bom_items bi JOIN parts p ON p.id = bi."partId" '
            'WHERE bi."bomTemplateId" = :tid AND bi."tenantId" = :ten '
            'ORDER BY bi."sortOrder"'
        ),
        {"tid": template_id, "ten": current_user.tenantId},
    )
    items = items_result.fetchall()

    total_cost = sum((row[2] or 0) * (row[6] or 0) for row in items)

    wb = Workbook()
    ws = wb.active
    ws.title = "BOM Items"

    _build_header(
        ws,
        ["#", "PN", "Name", "Qty", "UoM", "Category", "Vendor", "Ref Des", "Unit Cost", "Ext Cost"],
    )

    for i, row in enumerate(items, 1):
        ext = (row[2] or 0) * (row[6] or 0)
        ws.cell(row=i + 1, column=1, value=i)
        ws.cell(row=i + 1, column=2, value=row[0] or "")
        ws.cell(row=i + 1, column=3, value=row[1] or "")
        ws.cell(row=i + 1, column=4, value=row[2] or 0)
        ws.cell(row=i + 1, column=5, value=row[3] or "")
        ws.cell(row=i + 1, column=6, value=row[4] or "")
        ws.cell(row=i + 1, column=7, value=row[5] or "")
        ws.cell(row=i + 1, column=8, value=row[7] or "")
        ws.cell(row=i + 1, column=9, value=row[6] or 0)
        ws.cell(row=i + 1, column=10, value=round(ext, 2))
    total_row = len(items) + 2
    ws.cell(row=total_row, column=8, value="TOTAL")
    ws.cell(row=total_row, column=8).font = Font(bold=True)
    ws.cell(row=total_row, column=10, value=round(total_cost, 2))
    ws.cell(row=total_row, column=10).font = Font(bold=True)

    _auto_width(ws)

    safe_name = (tmpl["name"] or "bom").replace(" ", "_").replace("/", "-")
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=bom_{safe_name}.xlsx"},
    )


@router.get("/bom/pdf")
async def export_bom_pdf(
    template_id: int = Query(..., description="BOM Template ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    template = await db.execute(
        text('SELECT * FROM bom_templates WHERE id = :id AND "tenantId" = :tid'),
        {"id": template_id, "tid": current_user.tenantId},
    )
    tmpl = template.mappings().first()
    if not tmpl:
        raise HTTPException(404, "BOM template not found")

    items_result = await db.execute(
        text(
            'SELECT p.pn, p.name, bi.quantity, p.uom, p.category, p.vendor, p.cost, '
            'bi."referenceDesignator" '
            'FROM bom_items bi JOIN parts p ON p.id = bi."partId" '
            'WHERE bi."bomTemplateId" = :tid AND bi."tenantId" = :ten '
            'ORDER BY bi."sortOrder"'
        ),
        {"tid": template_id, "ten": current_user.tenantId},
    )
    items = items_result.fetchall()

    total_cost = sum((row[2] or 0) * (row[6] or 0) for row in items)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4))
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"BOM Report: {tmpl['name']}", styles["Title"]))
    elements.append(Spacer(1, 10))
    elements.append(
        Paragraph(
            f"Status: {tmpl.get('status', 'N/A')} | "
            f"Created: {str(tmpl.get('createdAt', 'N/A'))[:10]} | "
            f"Items: {len(items)}",
            styles["Normal"],
        )
    )
    elements.append(Spacer(1, 20))

    data = [["#", "PN", "Name", "Qty", "UoM", "Category", "Vendor", "Ref Des", "Unit Cost", "Ext Cost"]]
    for i, row in enumerate(items, 1):
        ext = (row[2] or 0) * (row[6] or 0)
        data.append(
            [
                str(i),
                str(row[0] or ""),
                str(row[1] or ""),
                str(row[2] or ""),
                str(row[3] or ""),
                str(row[4] or ""),
                str(row[5] or ""),
                str(row[7] or ""),
                f"${(row[6] or 0):,.2f}",
                f"${ext:,.2f}",
            ]
        )
    data.append(["", "", "", "", "", "", "", "TOTAL", "", f"${total_cost:,.2f}"])

    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F3F4F6")]),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E5E7EB")),
                ("FONTSIZE", (0, -1), (-1, -1), 8),
                ("ALIGN", (3, 0), (3, -1), "RIGHT"),
                ("ALIGN", (8, 0), (-1, -1), "RIGHT"),
            ]
        )
    )
    elements.append(table)
    doc.build(elements)
    buf.seek(0)

    safe_name = (tmpl["name"] or "bom").replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=bom_{safe_name}.pdf"},
    )

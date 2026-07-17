"""Dashboard service layer — business logic for KPI aggregation across all domains."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


def tenant_filter_params(current_user: User, alias: str = "") -> tuple[str, dict]:
    if current_user.isSuperuser:
        return "TRUE", {}
    tid = current_user.tenantId
    if tid is None:
        return "FALSE", {}
    prefix = f"{alias}." if alias else ""
    return f'{prefix}"tenantId" = :tenantId', {"tenantId": tid}


async def engineering_dashboard(db: AsyncSession, user: User) -> dict:
    tf, tf_params = tenant_filter_params(user)

    async def _count(query: str) -> int:
        return (await db.execute(text(query), tf_params)).scalar() or 0

    eco_total = await _count(f"SELECT COUNT(*) FROM eco_headers WHERE {tf}")
    eco_open = await _count(
        f"SELECT COUNT(*) FROM eco_headers WHERE {tf} AND status IN ('draft', 'review')"
    )
    eco_approved = await _count(
        f"SELECT COUNT(*) FROM eco_headers WHERE {tf} AND status = 'approved'"
    )
    eco_implemented = await _count(
        f"SELECT COUNT(*) FROM eco_headers WHERE {tf} AND status = 'implemented'"
    )
    bom_count = await _count(f"SELECT COUNT(*) FROM bom_templates WHERE {tf}")
    part_count = await _count(f"SELECT COUNT(*) FROM parts WHERE {tf}")
    revision_count = await _count(f"SELECT COUNT(*) FROM revisions WHERE {tf}")
    routing_count = await _count(f"SELECT COUNT(*) FROM routing_tables WHERE {tf}")
    process_plan_count = await _count(f"SELECT COUNT(*) FROM process_plans WHERE {tf}")
    doc_count = await _count(f"SELECT COUNT(*) FROM documents WHERE {tf}")

    r_by_type = await db.execute(
        text(
            f"SELECT change_type, COUNT(*) as cnt FROM eco_headers WHERE {tf} GROUP BY change_type ORDER BY cnt DESC"
        ),
        tf_params,
    )
    by_type = [dict(row) for row in r_by_type.mappings().all()]

    r_by_priority = await db.execute(
        text(
            f"SELECT priority, COUNT(*) as cnt FROM eco_headers WHERE {tf} GROUP BY priority ORDER BY cnt DESC"
        ),
        tf_params,
    )
    by_priority = [dict(row) for row in r_by_priority.mappings().all()]

    return {
        "kpis": {
            "total_ecos": eco_total,
            "open_ecos": eco_open,
            "approved_ecos": eco_approved,
            "implemented_ecos": eco_implemented,
            "total_boms": bom_count,
            "total_parts": part_count,
            "total_revisions": revision_count,
            "total_routings": routing_count,
            "total_process_plans": process_plan_count,
            "total_documents": doc_count,
        },
        "ecos_by_type": by_type,
        "ecos_by_priority": by_priority,
    }


async def manufacturing_dashboard(db: AsyncSession, user: User) -> dict:
    tf, tf_params = tenant_filter_params(user)

    async def _count(query: str) -> int:
        return (await db.execute(text(query), tf_params)).scalar() or 0

    wo_total = await _count(f"SELECT COUNT(*) FROM work_orders WHERE {tf}")
    wo_draft = await _count(f"SELECT COUNT(*) FROM work_orders WHERE {tf} AND status = 'draft'")
    wo_in_progress = await _count(
        f"SELECT COUNT(*) FROM work_orders WHERE {tf} AND status = 'in_progress'"
    )
    wo_completed = await _count(
        f"SELECT COUNT(*) FROM work_orders WHERE {tf} AND status = 'completed'"
    )
    wo_overdue = await _count(
        f"SELECT COUNT(*) FROM work_orders WHERE {tf} AND due_date < CURRENT_DATE AND status NOT IN ('completed', 'closed')"
    )

    wc_count = await _count(f"SELECT COUNT(*) FROM work_centers WHERE {tf} AND is_active = true")
    routing_count = await _count(f"SELECT COUNT(*) FROM routing_tables WHERE {tf}")
    pp_count = await _count(f"SELECT COUNT(*) FROM process_plans WHERE {tf}")

    total_planned = await _count(
        f"SELECT COALESCE(SUM(quantity_ordered), 0) FROM work_orders WHERE {tf}"
    )
    total_completed = await _count(
        f"SELECT COALESCE(SUM(quantity_completed), 0) FROM work_orders WHERE {tf}"
    )
    total_scrapped = await _count(
        f"SELECT COALESCE(SUM(quantity_scrapped), 0) FROM work_orders WHERE {tf}"
    )
    yield_rate = (
        round(float(total_completed) / float(total_planned) * 100, 1) if total_planned > 0 else 0
    )

    tf_wc, tf_wc_params = tenant_filter_params(user, "wc")
    wc_util = await db.execute(
        text(f"""
        SELECT wc.code, wc.name, wc.capacity_per_hour,
               COALESCE(rs.planned_hours, 0) as planned,
               wc.available_hours_per_day
        FROM work_centers wc
        LEFT JOIN (SELECT work_center_id, SUM(planned_hours) as planned_hours FROM resource_schedules WHERE scheduled_date >= CURRENT_DATE GROUP BY work_center_id) rs ON wc.id = rs.work_center_id
        WHERE wc.is_active = true AND {tf_wc} ORDER BY wc.code
    """),
        tf_wc_params,
    )
    utilization = [dict(row) for row in wc_util.mappings().all()]

    return {
        "kpis": {
            "total_work_orders": wo_total,
            "draft": wo_draft,
            "in_progress": wo_in_progress,
            "completed": wo_completed,
            "overdue": wo_overdue,
            "total_planned_qty": int(total_planned),
            "total_completed_qty": int(total_completed),
            "total_scrapped_qty": int(total_scrapped),
            "yield_rate_pct": yield_rate,
            "work_centers": wc_count,
            "routings": routing_count,
            "process_plans": pp_count,
        },
        "work_center_utilization": utilization,
    }


async def procurement_dashboard(db: AsyncSession, user: User) -> dict:
    tf, tf_params = tenant_filter_params(user)

    async def _count(query: str) -> int:
        return (await db.execute(text(query), tf_params)).scalar() or 0

    po_total = await _count(f'SELECT COUNT(*) FROM "po_headers" WHERE {tf}')
    po_draft = await _count(f"SELECT COUNT(*) FROM \"po_headers\" WHERE {tf} AND status = 'draft'")
    po_submitted = await _count(
        f"SELECT COUNT(*) FROM \"po_headers\" WHERE {tf} AND status = 'submitted'"
    )
    po_received = await _count(
        f"SELECT COUNT(*) FROM \"po_headers\" WHERE {tf} AND status = 'received'"
    )
    po_value = await _count(f'SELECT COALESCE(SUM("poTotal"), 0) FROM "po_headers" WHERE {tf}')

    vendor_count = await _count(f"SELECT COUNT(*) FROM vendors WHERE {tf}")
    active_vendors = await _count(
        f"SELECT COUNT(*) FROM vendors WHERE {tf} AND (active = true OR active IS NULL)"
    )
    part_vendor_count = await _count(f"SELECT COUNT(*) FROM part_vendors WHERE {tf}")
    contract_count = await _count(f"SELECT COUNT(*) FROM contracts WHERE {tf}")
    avg_lead = await _count(f"SELECT AVG(lead) FROM parts WHERE {tf} AND lead > 0")

    r_spend = await db.execute(
        text(f"""
        SELECT "vendorName", SUM("poTotal") as total_spend, COUNT(*) as po_count
        FROM "po_headers" WHERE {tf} AND "vendorName" IS NOT NULL
        GROUP BY "vendorName" ORDER BY total_spend DESC LIMIT 10
    """),
        tf_params,
    )
    top_vendors = [dict(row) for row in r_spend.mappings().all()]

    return {
        "kpis": {
            "total_pos": po_total,
            "draft_pos": po_draft,
            "submitted_pos": po_submitted,
            "received_pos": po_received,
            "total_po_value": float(po_value),
            "total_vendors": vendor_count,
            "active_vendors": active_vendors,
            "part_vendor_links": part_vendor_count,
            "contracts": contract_count,
            "avg_lead_time_days": round(float(avg_lead), 1),
            "low_stock_parts": 0,
        },
        "top_vendors_by_spend": top_vendors,
    }


async def executive_dashboard(db: AsyncSession, user: User) -> dict:
    tf, tf_params = tenant_filter_params(user)

    async def _count(query: str) -> int:
        return (await db.execute(text(query), tf_params)).scalar() or 0

    part_count = await _count(f"SELECT COUNT(*) FROM parts WHERE {tf}")
    bom_count = await _count(f"SELECT COUNT(*) FROM bom_templates WHERE {tf}")
    vendor_count = await _count(f"SELECT COUNT(*) FROM vendors WHERE {tf}")
    po_count = await _count(f'SELECT COUNT(*) FROM "po_headers" WHERE {tf}')
    po_value = await _count(f'SELECT COALESCE(SUM("poTotal"), 0) FROM "po_headers" WHERE {tf}')
    user_count = await _count(f"SELECT COUNT(*) FROM users WHERE {tf}")
    doc_count = await _count(f"SELECT COUNT(*) FROM documents WHERE {tf}")
    eco_count = await _count(f"SELECT COUNT(*) FROM eco_headers WHERE {tf}")
    wo_count = await _count(f"SELECT COUNT(*) FROM work_orders WHERE {tf}")
    ncr_count = await _count(f"SELECT COUNT(*) FROM ncr_reports WHERE {tf}")

    r_spend = await db.execute(
        text(f"""
        SELECT TO_CHAR("poDate"::date, 'YYYY-MM') as month, SUM("poTotal") as spend
        FROM "po_headers" WHERE {tf} AND "poDate" IS NOT NULL
        GROUP BY month ORDER BY month DESC LIMIT 12
    """),
        tf_params,
    )
    monthly_spend = [dict(row) for row in r_spend.mappings().all()]

    r_status = await db.execute(
        text(f"""
        SELECT status, COUNT(*) as cnt FROM (
            SELECT status FROM work_orders WHERE {tf}
            UNION ALL
            SELECT status FROM eco_headers WHERE {tf}
            UNION ALL
            SELECT status FROM "po_headers" WHERE {tf}
        ) combined GROUP BY status ORDER BY cnt DESC
    """),
        tf_params,
    )
    status_summary = [dict(row) for row in r_status.mappings().all()]

    return {
        "kpis": {
            "total_parts": part_count,
            "total_boms": bom_count,
            "total_vendors": vendor_count,
            "total_pos": po_count,
            "total_po_value": float(po_value),
            "total_users": user_count,
            "total_documents": doc_count,
            "total_ecos": eco_count,
            "total_work_orders": wo_count,
            "total_ncrs": ncr_count,
        },
        "monthly_spend": monthly_spend,
        "status_summary": status_summary,
    }

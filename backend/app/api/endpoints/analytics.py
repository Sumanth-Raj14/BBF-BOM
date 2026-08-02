from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.part import Part
from app.models.part_vendor import PartVendor
from app.models.user import User

router = APIRouter()


def _tenant_filter_params(current_user: User, alias: str = "") -> tuple[str, dict]:
    if current_user.isSuperuser:
        return "TRUE", {}
    tid = current_user.tenantId
    if tid is None:
        return "FALSE", {}
    prefix = f"{alias}." if alias else ""
    return f'{prefix}"tenantId" = :tenantId', {"tenantId": tid}


@router.get("/dashboard")
async def analytics_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tf, tf_params = _tenant_filter_params(current_user)
    result = {}

    parts_count = await db.execute(text(f"SELECT COUNT(*) FROM parts WHERE {tf}"), tf_params)
    result["totalParts"] = parts_count.scalar() or 0

    vendors_count = await db.execute(text(f"SELECT COUNT(*) FROM vendors WHERE {tf}"), tf_params)
    result["totalVendors"] = vendors_count.scalar() or 0

    po_count = await db.execute(text(f'SELECT COUNT(*) FROM "po_headers" WHERE {tf}'), tf_params)
    result["totalPOs"] = po_count.scalar() or 0

    po_by_status = await db.execute(
        text(f'SELECT status, COUNT(*) FROM "po_headers" WHERE {tf} GROUP BY status'), tf_params
    )
    result["poByStatus"] = {row[0]: row[1] for row in po_by_status.fetchall()}

    doc_count = await db.execute(text(f"SELECT COUNT(*) FROM documents WHERE {tf}"), tf_params)
    result["totalDocuments"] = doc_count.scalar() or 0

    total_cost = await db.execute(
        text(f'SELECT COALESCE(SUM("poTotal"), 0) FROM "po_headers" WHERE {tf}'), tf_params
    )
    result["totalPOValue"] = float(total_cost.scalar() or 0)

    avg_cost = await db.execute(
        text(f'SELECT COALESCE(AVG("poTotal"), 0) FROM "po_headers" WHERE {tf}'), tf_params
    )
    result["avgPOValue"] = float(avg_cost.scalar() or 0)

    vendor_breakdown = await db.execute(
        text(
            f'SELECT "vendorName", COUNT(*), SUM("poTotal") FROM "po_headers" WHERE {tf} GROUP BY "vendorName" ORDER BY SUM("poTotal") DESC LIMIT 10'
        ),
        tf_params,
    )
    result["vendorSpend"] = [
        {"vendor": row[0], "poCount": row[1], "totalSpend": float(row[2] or 0)}
        for row in vendor_breakdown.fetchall()
    ]

    monthly_spend = await db.execute(
        text(f"""
                SELECT TO_CHAR("poDate"::date, 'YYYY-MM') as month, COALESCE(SUM("poTotal"), 0) as spend
                FROM "po_headers"
                WHERE {tf} AND "poDate" IS NOT NULL
                GROUP BY TO_CHAR("poDate"::date, 'YYYY-MM')
                ORDER BY month DESC LIMIT 12
            """),
        tf_params,
    )
    result["monthlySpend"] = [
        {"month": row[0], "spend": float(row[1])} for row in monthly_spend.fetchall()
    ]

    recent_pos = await db.execute(
        text(
            f'SELECT "poNumber", status, "poTotal", "createdAt" FROM "po_headers" WHERE {tf} ORDER BY "createdAt" DESC LIMIT 5'
        ),
        tf_params,
    )
    result["recentActivity"] = [
        {
            "poNumber": row[0],
            "status": row[1],
            "totalCost": float(row[2] or 0),
            "createdAt": str(row[3]) if row[3] else None,
        }
        for row in recent_pos.fetchall()
    ]

    project_breakdown = await db.execute(
        text(f"""
                SELECT COALESCE(project, 'Unassigned') as project_name,
                       COUNT(*) as po_count,
                       COALESCE(SUM("poTotal"), 0) as total_cost,
                       COALESCE(SUM("poTotal") FILTER (WHERE status IN ('received', 'closed')), 0) as spent,
                       COALESCE(SUM("poTotal") FILTER (WHERE status NOT IN ('received', 'closed', 'cancelled', 'Rejected')), 0) as committed
                FROM "po_headers"
                WHERE {tf}
                GROUP BY COALESCE(project, 'Unassigned')
                ORDER BY total_cost DESC
            """),
        tf_params,
    )
    result["byProject"] = [
        {
            "project": row[0],
            "poCount": row[1],
            "totalCost": float(row[2] or 0),
            "spent": float(row[3] or 0),
            "committed": float(row[4] or 0),
        }
        for row in project_breakdown.fetchall()
    ]

    return result


@router.get("/trends")
async def analytics_trends(
    range_: str = "6mo",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tf, tf_params = _tenant_filter_params(current_user)
    interval_map = {
        "1mo": "1 month",
        "3mo": "3 months",
        "6mo": "6 months",
        "1yr": "1 year",
    }
    interval = interval_map.get(range_, "6 months")

    cost_trend = await db.execute(
        text(f"""
                SELECT TO_CHAR("createdAt", 'YYYY-MM') as month,
                       COALESCE(AVG(cost), 0) as avg_cost,
                       COUNT(*) as part_count
                FROM parts
                WHERE {tf} AND "createdAt" >= NOW() - INTERVAL '{interval}'
                GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
                ORDER BY month
            """),
        tf_params,
    )
    return {
        "range": range_,
        "data": [
            {"month": row[0], "avgCost": float(row[1]), "partCount": row[2]}
            for row in cost_trend.fetchall()
        ],
    }


@router.get("/categories")
async def analytics_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tf, tf_params = _tenant_filter_params(current_user)
    categories = await db.execute(
        text(f"""
            SELECT COALESCE(category, 'Other') as category,
                   COUNT(*) as count,
                   COALESCE(SUM(cost), 0) as total_cost
            FROM parts
            WHERE {tf}
            GROUP BY COALESCE(category, 'Other')
            ORDER BY total_cost DESC
        """),
        tf_params,
    )
    return [
        {"category": row[0], "count": row[1], "totalCost": float(row[2])}
        for row in categories.fetchall()
    ]


@router.get("/inflation")
async def analytics_inflation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Category-level price inflation trend for the Inflation Analysis modal
    (frontend/src/components/advanced/InflationAnalysisModal.jsx). Derived
    from price_history joined to parts for category, tenant-scoped via
    price_history."tenantId". Categories need at least two distinct months
    of price records to produce a trend; thin data is omitted rather than
    guessed at.
    """
    tf, tf_params = _tenant_filter_params(current_user, "ph")
    rows = await db.execute(
        text(f"""
            SELECT COALESCE(p.category, 'Other') as category,
                   TO_CHAR(COALESCE(ph."effectiveDate", ph."recordedAt"), 'YYYY-MM') as month,
                   AVG(ph.price) as avg_price
            FROM price_history ph
            JOIN parts p ON p.id = ph."partId"
            WHERE {tf}
            GROUP BY COALESCE(p.category, 'Other'),
                     TO_CHAR(COALESCE(ph."effectiveDate", ph."recordedAt"), 'YYYY-MM')
            ORDER BY category, month
        """),
        tf_params,
    )

    by_category: dict[str, list[dict]] = {}
    for row in rows.fetchall():
        by_category.setdefault(row[0], []).append({"month": row[1], "avgPrice": float(row[2])})

    categories = []
    for category, points in by_category.items():
        if len(points) < 2:
            continue
        baseline = points[0]["avgPrice"]
        current = points[-1]["avgPrice"]
        change_pct = ((current - baseline) / baseline * 100) if baseline else 0.0
        categories.append(
            {
                "category": category,
                "points": points,
                "baseline": baseline,
                "current": current,
                "changePct": change_pct,
            }
        )
    categories.sort(key=lambda c: c["changePct"], reverse=True)
    return {"categories": categories}


@router.get("/vendor-scorecards")
async def vendor_scorecards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Vendor scorecards for the Analytics screen.

    Spend figures come from po_headers. On-time and quality come from the
    part_vendors links (app/models/part_vendor.py: onTimeRate 0-100,
    qualityScore 0-5) averaged over the vendor's parts - the same stored
    performance data /analytics/at-risk-parts already treats as authoritative.
    A vendor with no part links has no measurement, so those fields are null
    rather than a plausible-looking constant.

    responseTime has no source in this schema: nothing records a vendor
    enquiry/response timestamp pair. supplier_scorecards.avgResponseTimeHours
    exists but belongs to the periodic-scorecard subsystem and is not populated
    from anything, so it is reported as null.
    """
    tf, tf_params = _tenant_filter_params(current_user, "v")

    # Queried separately: joining part_vendors into the PO aggregate below
    # would fan out the rows and inflate totalSpend / avgPOValue.
    perf_rows = await db.execute(
        text(f"""
            SELECT v.name,
                   AVG(pv."onTimeRate") as on_time_rate,
                   AVG(pv."qualityScore") as quality_score
            FROM part_vendors pv
            JOIN vendors v ON v.id = pv."vendorId"
            WHERE {tf}
            GROUP BY v.name
        """),
        tf_params,
    )
    perf = {row[0]: (row[1], row[2]) for row in perf_rows.fetchall()}

    result = await db.execute(
        text(f"""
            SELECT
                v.name,
                v."reliabilityRating",
                COUNT(DISTINCT p.id) as po_count,
                COALESCE(SUM(p."poTotal"), 0) as total_spend,
                COALESCE(AVG(p."poTotal"), 0) as avg_po_value
            FROM vendors v
            LEFT JOIN "po_headers" p ON p."vendorName" = v.name AND {tf.replace("v.", "p.")}
            WHERE {tf}
            GROUP BY v.name, v."reliabilityRating"
            ORDER BY total_spend DESC
        """),
        tf_params,
    )
    scorecards = []
    for row in result.fetchall():
        on_time, quality = perf.get(row[0], (None, None))
        scorecards.append(
            {
                "vendor": row[0],
                "reliabilityRating": row[1],
                "poCount": row[2],
                "totalSpend": float(row[3] or 0),
                "avgPOValue": float(row[4] or 0),
                "onTimeRate": float(on_time) if on_time is not None else None,
                "qualityScore": float(quality) if quality is not None else None,
                "responseTime": None,
            }
        )
    return scorecards


@router.get("/most-used-parts")
async def most_used_parts(
    limit: int = 5,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cross-BOM part reuse rollup for the dashboard's "Where Used" tile: the
    parts referenced by the most distinct BOMs, tenant-scoped via
    bom_items_master.tenantId (see app/models/bom.py::BOMItem).
    """
    tf, tf_params = _tenant_filter_params(current_user, "bi")
    result = await db.execute(
        text(f"""
            SELECT p.pn, p.name, COUNT(DISTINCT bi.bom_id) as bom_count
            FROM bom_items_master bi
            JOIN parts p ON p.id = bi.part_id
            WHERE {tf} AND bi.part_id IS NOT NULL
            GROUP BY p.id, p.pn, p.name
            ORDER BY bom_count DESC, p.pn ASC
            LIMIT :limit
        """),
        {**tf_params, "limit": limit},
    )
    return [
        {"partNumber": row[0], "name": row[1], "uses": row[2]}
        for row in result.fetchall()
    ]


@router.get("/at-risk-parts")
async def at_risk_parts(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Supply-risk rollup for the dashboard's "Supply Risk" tile: parts whose
    vendor links show a long lead time, single-sourcing, or weak vendor
    quality/on-time performance. Built from part_vendors + parts; tenant
    scoping comes from the standard ORM select filter (app/core/tenant_events.py),
    same as vendors.py / part_vendors.py.
    """
    parts_result = await db.execute(select(Part))
    parts_by_id = {p.id: p for p in parts_result.scalars().all()}
    if not parts_by_id:
        return {"items": [], "total": 0}

    links_result = await db.execute(
        select(PartVendor).where(PartVendor.partId.in_(parts_by_id.keys()))
    )
    links_by_part: dict[int, list[PartVendor]] = {}
    for link in links_result.scalars().all():
        links_by_part.setdefault(link.partId, []).append(link)

    LEAD_HIGH, LEAD_MED = 30, 21
    QUALITY_LOW, ON_TIME_LOW = 3.0, 80.0

    items = []
    for part_id, links in links_by_part.items():
        part = parts_by_id.get(part_id)
        if not part:
            continue
        max_lead = max((link.vendorLead or 0) for link in links)
        min_quality = min(
            (link.qualityScore if link.qualityScore is not None else 5.0) for link in links
        )
        min_on_time = min(
            (link.onTimeRate if link.onTimeRate is not None else 100.0) for link in links
        )
        vendor_count = len({link.vendorId for link in links})

        reasons = []
        severity = "low"
        if max_lead >= LEAD_HIGH:
            reasons.append(f"Lead time {max_lead}d")
            severity = "high"
        elif max_lead >= LEAD_MED:
            reasons.append(f"Lead time {max_lead}d")
            severity = "med"
        if vendor_count <= 1:
            reasons.append("Single-source")
            if severity == "low":
                severity = "med"
        if min_quality < QUALITY_LOW:
            reasons.append(f"Quality score {min_quality:.1f}")
            severity = "high"
        if min_on_time < ON_TIME_LOW:
            reasons.append(f"On-time rate {min_on_time:.0f}%")
            if severity == "low":
                severity = "med"

        if not reasons:
            continue

        items.append(
            {
                "partId": part_id,
                "pn": part.pn,
                "name": part.name,
                "reason": "; ".join(reasons),
                "severity": severity,
            }
        )

    order = {"high": 0, "med": 1, "low": 2}
    items.sort(key=lambda it: order.get(it["severity"], 3))
    return {"items": items[:limit], "total": len(items)}

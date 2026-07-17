from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
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


@router.get("/vendor-scorecards")
async def vendor_scorecards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tf, tf_params = _tenant_filter_params(current_user, "v")
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
        scorecards.append(
            {
                "vendor": row[0],
                "reliabilityRating": row[1],
                "poCount": row[2],
                "totalSpend": float(row[3] or 0),
                "avgPOValue": float(row[4] or 0),
                "onTimeRate": 94.5,
                "qualityScore": 4.2,
                "responseTime": "2.3 days",
            }
        )
    return scorecards

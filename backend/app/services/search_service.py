"""Search service layer — full-text search across all entity types."""

import time
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


def tenant_clause(current_user: User, alias: str = "") -> tuple[str, dict]:
    if current_user.isSuperuser:
        return "", {}
    tid = current_user.tenantId
    if tid is None:
        return "AND 1=0", {}
    prefix = f"{alias}." if alias else ""
    return f'AND {prefix}"tenantId" = :tenant_id', {"tenant_id": tid}


async def advanced_search(
    db: AsyncSession,
    q: str,
    current_user: User,
    entity_types: Optional[str] = None,
    limit: int = 50,
) -> dict:
    start = time.time()

    types = (
        [t.strip() for t in entity_types.split(",")]
        if entity_types
        else [
            "parts",
            "vendors",
            "boms",
            "pos",
            "documents",
            "eco",
            "work_orders",
            "inventory",
            "ncr",
        ]
    )

    results = []
    pattern = f"%{q}%"

    def _p(base: dict, extra: dict) -> dict:
        p = dict(base)
        p.update(extra)
        return p

    for t in types:
        if t == "parts":
            tc_p, tp_p = tenant_clause(current_user)
            rows = await db.execute(
                text(f"""
                    SELECT id, pn, name, description, category, vendor, cost, status,
                           ts_rank(
                               to_tsvector('english', coalesce(pn,'') || ' ' || coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(mpn,'')),
                               plainto_tsquery('english', :q)
                           ) AS rank
                    FROM parts
                    WHERE (to_tsvector('english', coalesce(pn,'') || ' ' || coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(mpn,''))
                          @@ plainto_tsquery('english', :q)
                       OR pn ILIKE :pattern OR name ILIKE :pattern OR description ILIKE :pattern)
                       {tc_p}
                    ORDER BY rank DESC, pn ILIKE :exact DESC, name ILIKE :exact DESC
                    LIMIT :limit
                """),
                _p({"q": q, "pattern": pattern, "exact": q, "limit": limit}, tp_p),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "parts",
                        "entity_id": row["id"],
                        "title": f"{row['pn']} — {row['name']}",
                        "subtitle": f"{row['category'] or ''} | {row['vendor'] or ''} | ${row['cost'] or 0:.2f}",
                        "relevance": 0.9 if q.upper() == (row["pn"] or "").upper() else 0.7,
                    }
                )

        elif t == "vendors":
            tc_v, tp_v = tenant_clause(current_user)
            rows = await db.execute(
                text(f"""
                    SELECT id, name, country, "contactEmail", active,
                           ts_rank(
                               to_tsvector('english', coalesce(name,'') || ' ' || coalesce(country,'') || ' ' || coalesce("contactEmail",'')),
                               plainto_tsquery('english', :q)
                           ) AS rank
                    FROM vendors
                    WHERE (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(country,'') || ' ' || coalesce("contactEmail",''))
                          @@ plainto_tsquery('english', :q)
                       OR name ILIKE :pattern OR country ILIKE :pattern)
                       {tc_v}
                    ORDER BY rank DESC, name ILIKE :exact DESC
                    LIMIT :limit
                """),
                _p({"q": q, "pattern": pattern, "exact": q, "limit": limit}, tp_v),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "vendors",
                        "entity_id": row["id"],
                        "title": row["name"],
                        "subtitle": f"{row['country'] or ''} | {'Active' if row.get('active') else 'Inactive'}",
                        "relevance": 0.65,
                    }
                )

        elif t == "boms":
            tc_b, tp_b = tenant_clause(current_user)
            rows = await db.execute(
                text(
                    f'SELECT id, name, description, "partCount" FROM bom_templates '
                    f"WHERE (name ILIKE :pattern OR description ILIKE :pattern) {tc_b} "
                    f"ORDER BY name ILIKE :exact DESC LIMIT :limit"
                ),
                _p({"pattern": pattern, "exact": q, "limit": limit}, tp_b),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "boms",
                        "entity_id": row["id"],
                        "title": row["name"],
                        "subtitle": f"Parts: {row['partCount'] or 0} | {row['description'] or ''}",
                        "relevance": 0.6,
                    }
                )

        elif t == "pos":
            tc_po, tp_po = tenant_clause(current_user)
            rows = await db.execute(
                text(
                    f'SELECT id, "poNumber", "vendorName", project, status, "poTotal" '
                    f'FROM po_headers WHERE ("poNumber" ILIKE :pattern OR "vendorName" ILIKE :pattern '
                    f"OR project ILIKE :pattern) {tc_po} "
                    f'ORDER BY "poNumber" ILIKE :exact DESC LIMIT :limit'
                ),
                _p({"pattern": pattern, "exact": q, "limit": limit}, tp_po),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "pos",
                        "entity_id": row["id"],
                        "title": row["poNumber"],
                        "subtitle": f"{row['vendorName'] or ''} | ${row['poTotal'] or 0:,.2f} | {row['status'] or ''}",
                        "relevance": 0.6,
                    }
                )

        elif t == "documents":
            tc_d, tp_d = tenant_clause(current_user)
            rows = await db.execute(
                text(
                    f'SELECT id, "originalName", "fileType", "fileSize" '
                    f'FROM documents WHERE ("originalName" ILIKE :pattern) {tc_d} '
                    f'ORDER BY "originalName" ILIKE :exact DESC LIMIT :limit'
                ),
                _p({"pattern": pattern, "exact": q, "limit": limit}, tp_d),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "documents",
                        "entity_id": row["id"],
                        "title": row["originalName"],
                        "subtitle": f"{row['fileType'] or ''} | {row['fileSize'] or 0} bytes",
                        "relevance": 0.5,
                    }
                )

        elif t == "eco":
            tc_e, tp_e = tenant_clause(current_user)
            rows = await db.execute(
                text(
                    f"SELECT id, eco_number, title, status, priority FROM eco_headers "
                    f"WHERE (eco_number ILIKE :pattern OR title ILIKE :pattern OR description ILIKE :pattern) {tc_e} "
                    f"ORDER BY eco_number ILIKE :exact DESC LIMIT :limit"
                ),
                _p({"pattern": pattern, "exact": q, "limit": limit}, tp_e),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "eco",
                        "entity_id": row["id"],
                        "title": f"{row['eco_number']} — {row['title']}",
                        "subtitle": f"{row['status'] or ''} | {row['priority'] or ''}",
                        "relevance": 0.6,
                    }
                )

        elif t == "work_orders":
            tc_w, tp_w = tenant_clause(current_user)
            rows = await db.execute(
                text(
                    f"SELECT id, wo_number, customer_name, status, priority FROM work_orders "
                    f"WHERE (wo_number ILIKE :pattern OR customer_name ILIKE :pattern) {tc_w} "
                    f"ORDER BY wo_number ILIKE :exact DESC LIMIT :limit"
                ),
                _p({"pattern": pattern, "exact": q, "limit": limit}, tp_w),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "work_orders",
                        "entity_id": row["id"],
                        "title": row["wo_number"],
                        "subtitle": f"{row['customer_name'] or ''} | {row['status'] or ''} | {row['priority'] or ''}",
                        "relevance": 0.6,
                    }
                )

        elif t == "inventory":
            tc_i, tp_i = tenant_clause(current_user, "i")
            rows = await db.execute(
                text(
                    f"SELECT i.id, p.pn, p.name, i.quantity_on_hand, i.lot_number, i.serial_number "
                    f"FROM inventory i JOIN parts p ON i.part_id = p.id "
                    f"WHERE (p.pn ILIKE :pattern OR p.name ILIKE :pattern OR i.lot_number ILIKE :pattern "
                    f"OR i.serial_number ILIKE :pattern) {tc_i} "
                    f"ORDER BY p.pn ILIKE :exact DESC LIMIT :limit"
                ),
                _p({"pattern": pattern, "exact": q, "limit": limit}, tp_i),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "inventory",
                        "entity_id": row["id"],
                        "title": f"{row['pn']} — {row['name']}",
                        "subtitle": f"Qty: {row['quantity_on_hand']} | Lot: {row['lot_number'] or 'N/A'} | SN: {row['serial_number'] or 'N/A'}",
                        "relevance": 0.55,
                    }
                )

        elif t == "ncr":
            tc_n, tp_n = tenant_clause(current_user, "n")
            rows = await db.execute(
                text(
                    f"SELECT n.id, n.ncr_number, p.pn, p.name, n.status, n.severity "
                    f"FROM ncr_reports n LEFT JOIN parts p ON n.part_id = p.id "
                    f"WHERE (n.ncr_number ILIKE :pattern OR n.defect_description ILIKE :pattern "
                    f"OR p.pn ILIKE :pattern OR p.name ILIKE :pattern) {tc_n} "
                    f"ORDER BY n.ncr_number ILIKE :exact DESC LIMIT :limit"
                ),
                _p({"pattern": pattern, "exact": q, "limit": limit}, tp_n),
            )
            for row in rows.mappings():
                results.append(
                    {
                        "entity_type": "ncr",
                        "entity_id": row["id"],
                        "title": f"{row['ncr_number']} — {row['pn'] or 'N/A'} {row['name'] or ''}",
                        "subtitle": f"{row['status'] or ''} | {row['severity'] or ''}",
                        "relevance": 0.6,
                    }
                )

    results.sort(key=lambda r: r["relevance"], reverse=True)
    results = results[:limit]
    elapsed = (time.time() - start) * 1000

    return {
        "query": q,
        "total": len(results),
        "results": results,
        "took_ms": round(elapsed, 1),
    }


async def search_suggestions(
    db: AsyncSession,
    q: str,
    current_user: User,
    limit: int = 10,
) -> dict:
    pattern = f"%{q}%"
    tc_p, tp_p = tenant_clause(current_user)
    tc_v, tp_v = tenant_clause(current_user)
    tc_b, tp_b = tenant_clause(current_user)

    all_params = {"pattern": pattern, "limit": limit}
    all_params.update(tp_p)
    all_params.update(tp_v)
    all_params.update(tp_b)

    rows = await db.execute(
        text(f"""
            SELECT 'part' as type, id, pn as text FROM parts WHERE pn ILIKE :pattern {tc_p}
            UNION ALL
            SELECT 'vendor' as type, id, name as text FROM vendors WHERE name ILIKE :pattern {tc_v}
            UNION ALL
            SELECT 'bom' as type, id, name as text FROM bom_templates WHERE name ILIKE :pattern {tc_b}
            LIMIT :limit
        """),
        all_params,
    )
    suggestions = []
    for row in rows.mappings():
        suggestions.append(
            {
                "type": row["type"],
                "id": row["id"],
                "text": row["text"],
            }
        )

    return {"query": q, "suggestions": suggestions}

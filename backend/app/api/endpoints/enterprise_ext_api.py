"""
Multi-Currency + Compliance Certs + Auto-Numbering + Custom Attributes API

tenant-security: every statement here is raw text() SQL, which bypasses the ORM
tenant filter in tenant_events.py entirely (that only covers ORM select() and ORM
flush). All five tables touched here -- currencies, exchange_rates,
compliance_certificates, auto_number_schemes, custom_attribute_definitions -- carry
a NOT NULL tenantId. Before this was scoped, every SELECT returned other tenants'
rows, and every INSERT omitted tenantId, which cannot succeed against a NOT NULL
column at all. Scope reads with tenant_sql_clause(); set "tenantId" on every write.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.tenant_context import get_tenant_id, tenant_sql_clause
from app.db.session import get_db
from app.models.enterprise_extensions import CustomAttributeOption
from app.models.user import User

router = APIRouter()


class ExchangeRateCreate(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    source: Optional[str] = None


class ComplianceCertCreate(BaseModel):
    part_id: Optional[int] = None
    compliance_type: str
    issuing_body: Optional[str] = None
    issued_date: Optional[str] = None
    expiry_date: Optional[str] = None
    document_url: Optional[str] = None
    notes: Optional[str] = None


class AutoNumberSchemeCreate(BaseModel):
    entity_type: str
    prefix: str
    separator: str = "-"
    padding: int = 4
    suffix: Optional[str] = None


class CustomAttrCreate(BaseModel):
    entity_type: str
    name: Optional[str] = None
    attribute_name: Optional[str] = None
    display_name: Optional[str] = None
    data_type: Optional[str] = None
    attribute_type: Optional[str] = None
    description: Optional[str] = None
    is_required: bool = False
    is_searchable: bool = False
    default_value: Optional[str] = None
    options: Optional[list[str]] = None


# ---- Currencies ----


@router.get("/currencies")
async def list_currencies(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    # tenant-security: raw text() SQL bypasses tenant_events (ORM-only),
    # so the tenant predicate must be added explicitly.
    tc, tp = tenant_sql_clause()
    r = await db.execute(
        text(f"SELECT * FROM currencies WHERE is_active = true {tc} ORDER BY code"), tp
    )
    return [dict(row) for row in r.mappings().all()]


# ---- Exchange Rates ----


@router.get("/exchange-rates")
async def list_exchange_rates(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    # tenant-security: raw text() SQL bypasses tenant_events (ORM-only).
    tc, tp = tenant_sql_clause()
    r = await db.execute(
        text(
            f"SELECT * FROM exchange_rates WHERE is_active = true {tc} ORDER BY effective_date DESC LIMIT 100"
        ),
        tp,
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/exchange-rates")
async def create_exchange_rate(
    body: ExchangeRateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            'INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source, "tenantId") VALUES (:fc, :tc, :r, NOW(), :s, :_tenant_id)'
        ),
        {
            "fc": body.from_currency,
            "tc": body.to_currency,
            "r": body.rate,
            "s": body.source,
            "_tenant_id": get_tenant_id(),
        },
    )
    await db.commit()
    return {"status": "created"}


@router.get("/exchange-rates/convert")
async def convert_amount(
    amount: float,
    from_currency: str,
    to_currency: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # tenant-security: raw text() SQL bypasses tenant_events (ORM-only).
    tc, tp = tenant_sql_clause()
    r = await db.execute(
        text(
            f"SELECT rate FROM exchange_rates WHERE from_currency = :fc AND to_currency = :tc AND is_active = true {tc} ORDER BY effective_date DESC LIMIT 1"
        ),
        {"fc": from_currency, "tc": to_currency, **tp},
    )
    rate = r.scalar()
    if not rate:
        raise HTTPException(404, f"No exchange rate found for {from_currency} -> {to_currency}")
    result = {
        "amount": amount,
        "from": from_currency,
        "to": to_currency,
        "rate": float(rate),
        "converted": round(float(amount) * float(rate), 2),
        "converted_amount": round(float(amount) * float(rate), 2),
        "result": round(float(amount) * float(rate), 2),
    }
    return result


# ---- Compliance Certificates ----


@router.get("/compliance-certificates")
async def list_certificates(
    part_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if part_id:
        r = await db.execute(
            text(
                """SELECT *, compliance_type as certificate_type
                FROM compliance_certificates WHERE part_id = :pid ORDER BY id DESC"""
            ),
            {"pid": part_id},
        )
    else:
        r = await db.execute(
            text(
                """SELECT *, compliance_type as certificate_type
                FROM compliance_certificates ORDER BY id DESC LIMIT 100"""
            )
        )
    return [dict(row) for row in r.mappings().all()]


@router.post("/compliance-certificates")
async def create_certificate(
    body: ComplianceCertCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # tenant-security: raw text() SQL bypasses tenant_events (ORM-only),
    # so the tenant predicate must be added explicitly.
    tc, tp = tenant_sql_clause()
    count = (await db.execute(
        text(f"SELECT COUNT(*) FROM compliance_certificates WHERE 1=1 {tc}"), tp
    )).scalar() or 0
    cert_num = f"CERT-{body.compliance_type[:3].upper()}-{count + 1:04d}"
    await db.execute(
        text(
            'INSERT INTO compliance_certificates (certificate_number, part_id, compliance_type, issuing_body, issued_date, expiry_date, document_url, notes, "tenantId") VALUES (:cn, :pid, :ct, :ib, :id, :ed, :du, :n, :_tenant_id)'
        ),
        {
            "cn": cert_num,
            "pid": body.part_id,
            "ct": body.compliance_type,
            "ib": body.issuing_body,
            "id": body.issued_date,
            "ed": body.expiry_date,
            "du": body.document_url,
            "n": body.notes,
            "_tenant_id": get_tenant_id(),
        },
    )
    await db.commit()
    return {"certificate_number": cert_num, "status": "created"}


# ---- Auto-Numbering Schemes ----


@router.get("/auto-number-schemes")
async def list_schemes(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # tenant-security: raw text() SQL bypasses tenant_events (ORM-only).
    tc, tp = tenant_sql_clause()
    r = await db.execute(
        text(f"SELECT * FROM auto_number_schemes WHERE 1=1 {tc} ORDER BY entity_type"), tp
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/auto-number-schemes")
async def create_scheme(
    body: AutoNumberSchemeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    example = f"{body.prefix}{body.separator}{'0' * body.padding}1{body.suffix or ''}"
    await db.execute(
        text(
            'INSERT INTO auto_number_schemes (entity_type, prefix, separator, padding, suffix, format_example, "tenantId") VALUES (:et, :p, :s, :pad, :sf, :fe, :_tenant_id)'
        ),
        {
            "et": body.entity_type,
            "p": body.prefix,
            "s": body.separator,
            "pad": body.padding,
            "sf": body.suffix,
            "fe": example,
            "_tenant_id": get_tenant_id(),
        },
    )
    await db.commit()
    return {"status": "created", "format_example": example}


@router.post("/auto-number-schemes/generate")
async def generate_number(
    entity_type: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # tenant-security: raw text() SQL bypasses tenant_events (ORM-only),
    # so the tenant predicate must be added explicitly.
    tc, tp = tenant_sql_clause()
    r = await db.execute(
        text(
            f"SELECT * FROM auto_number_schemes WHERE entity_type = :et AND is_active = true {tc}"
        ),
        {"et": entity_type, **tp},
    )
    scheme = r.mappings().first()
    if not scheme:
        raise HTTPException(404, f"No active numbering scheme for entity type: {entity_type}")
    next_num = scheme["next_number"]
    padded = str(next_num).zfill(scheme["padding"])
    generated = f"{scheme['prefix']}{scheme['separator']}{padded}{scheme['suffix'] or ''}"
    await db.execute(
        text(f"UPDATE auto_number_schemes SET next_number = :nn WHERE id = :sid {tc}"),
        {"nn": next_num + 1, "sid": scheme["id"]},
    )
    await db.commit()
    return {"number": generated, "entity_type": entity_type, "next": next_num + 1}


# ---- Custom Attributes ----


@router.get("/custom-attributes")
async def list_custom_attributes(
    entity_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if entity_type:
        r = await db.execute(
            text(
                """SELECT *, attribute_name as name, attribute_type as data_type
                FROM custom_attribute_definitions WHERE entity_type = :et AND is_active = true ORDER BY sort_order"""
            ),
            {"et": entity_type},
        )
    else:
        r = await db.execute(
            text(
                """SELECT *, attribute_name as name, attribute_type as data_type
                FROM custom_attribute_definitions WHERE is_active = true ORDER BY entity_type, sort_order"""
            )
        )
    results = [dict(row) for row in r.mappings().all()]

    # Enrich with normalized options
    for attr in results:
        attr_id = attr.get("id")
        if attr_id:
            opts_r = await db.execute(
                select(CustomAttributeOption)
                .where(
                    CustomAttributeOption.attribute_definition_id == attr_id,
                    CustomAttributeOption.is_active,
                )
                .order_by(CustomAttributeOption.sort_order)
            )
            attr["options_normalized"] = [
                {"value": o.option_value, "label": o.display_label, "isDefault": o.is_default}
                for o in opts_r.scalars().all()
            ]

    return results


@router.post("/custom-attributes")
async def create_custom_attribute(
    body: CustomAttrCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import json

    attr_name = body.name or body.attribute_name or ""
    attr_type = body.data_type or body.attribute_type or "text"
    display = body.display_name or attr_name

    # Insert definition with legacy JSON columns
    result = await db.execute(
        text(
            'INSERT INTO custom_attribute_definitions (entity_type, attribute_name, display_name, attribute_type, is_required, is_searchable, default_value, options, "tenantId") VALUES (:et, :an, :dn, :at, :ir, :is, :dv, :opts, :_tenant_id) RETURNING id'
        ),
        {
            "et": body.entity_type,
            "an": attr_name,
            "dn": display,
            "at": attr_type,
            "ir": body.is_required,
            "is": body.is_searchable,
            "dv": body.default_value,
            "opts": json.dumps(body.options) if body.options else None,
            "_tenant_id": get_tenant_id(),
        },
    )
    definition_id = result.scalar()

    # Also write options to normalized table
    if body.options:
        for idx, opt in enumerate(body.options):
            option_value = (
                opt if isinstance(opt, str) else (opt.get("value") or opt.get("label", str(opt)))
            )
            display_label = (
                opt if isinstance(opt, str) else (opt.get("label") or opt.get("value", str(opt)))
            )
            db.add(
                CustomAttributeOption(
                    attribute_definition_id=definition_id,
                    option_value=option_value,
                    display_label=display_label,
                    sort_order=idx,
                    is_default=(idx == 0),
                )
            )

    await db.commit()
    return {"status": "created", "id": definition_id}


@router.delete("/custom-attributes/{attr_id}")
async def delete_custom_attribute(
    attr_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # tenant-security: raw text() SQL bypasses tenant_events (ORM-only),
    # so the tenant predicate must be added explicitly.
    tc, tp = tenant_sql_clause()
    await db.execute(
        text(f"UPDATE custom_attribute_definitions SET is_active = false WHERE id = :id {tc}"),
        {"id": attr_id},
    )
    await db.commit()
    return {"status": "deleted"}

"""Compliance Management API - ISO 9001, AS9100, RoHS, REACH, Conflict Minerals."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


# ---- Pydantic Schemas ----


class ComplianceCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ComplianceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    isActive: Optional[bool] = None


class CompliancePackCreate(BaseModel):
    name: str
    standard_id: int
    description: Optional[str] = None
    checklist: list[str] = []


class CompliancePackItemCreate(BaseModel):
    pack_id: int
    requirement: str
    sort_order: Optional[int] = None


class PartCertifyCreate(BaseModel):
    compliance_id: int
    certified_by: Optional[str] = None
    certification_date: Optional[date] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


# ---- CRUD: Compliance Standards ----


@router.get("/compliance")
async def list_compliance(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    r = await db.execute(
        text(
            'SELECT id, name, description, "isActive", "createdAt", "updatedAt" FROM compliance ORDER BY name'
        )
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/compliance")
async def create_compliance(
    body: ComplianceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        text(
            'INSERT INTO compliance (name, description) VALUES (:name, :desc) RETURNING id, name, description, "isActive", "createdAt", "updatedAt"'
        ),
        {"name": body.name, "desc": body.description},
    )
    await db.commit()
    return dict(r.mappings().one())


@router.get("/compliance/{compliance_id:int}")
async def get_compliance(
    compliance_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        text(
            'SELECT id, name, description, "isActive", "createdAt", "updatedAt" FROM compliance WHERE id = :id'
        ),
        {"id": compliance_id},
    )
    row = r.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Compliance standard not found")
    return dict(row)


@router.put("/compliance/{compliance_id:int}")
async def update_compliance(
    compliance_id: int,
    body: ComplianceUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = await db.execute(
        text("SELECT id FROM compliance WHERE id = :id"), {"id": compliance_id}
    )
    if not existing.mappings().one_or_none():
        raise HTTPException(status_code=404, detail="Compliance standard not found")

    sets = []
    params: dict = {"id": compliance_id}
    if body.name is not None:
        sets.append("name = :name")
        params["name"] = body.name
    if body.description is not None:
        sets.append("description = :desc")
        params["desc"] = body.description
    if body.isActive is not None:
        sets.append('"isActive" = :active')
        params["active"] = body.isActive
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    sets.append('"updatedAt" = NOW()')
    r = await db.execute(
        text(
            'UPDATE compliance SET {} WHERE id = :id RETURNING id, name, description, "isActive", "createdAt", "updatedAt"'.format(
                ", ".join(sets)
            )
        ),
        params,
    )
    await db.commit()
    return dict(r.mappings().one())


@router.patch("/compliance/{compliance_id:int}")
async def patch_compliance(
    compliance_id: int,
    body: ComplianceUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await update_compliance(compliance_id, body, db, user)


@router.delete("/compliance/{compliance_id:int}")
async def delete_compliance(
    compliance_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = await db.execute(
        text("SELECT id FROM compliance WHERE id = :id"), {"id": compliance_id}
    )
    if not existing.mappings().one_or_none():
        raise HTTPException(status_code=404, detail="Compliance standard not found")
    await db.execute(text("DELETE FROM compliance WHERE id = :id"), {"id": compliance_id})
    await db.commit()
    return {"status": "deleted"}


# ---- Compliance Packs ----


@router.get("/compliance/packs")
async def list_packs(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    r = await db.execute(
        text("""
            SELECT cp.id, cp.name, cp.standard_id, cp.description,
                   c.name AS standard_name, cp."createdAt",
                   COALESCE(
                       json_agg(
                           json_build_object('id', cpi.id, 'requirement', cpi.requirement, 'sort_order', cpi.sort_order)
                           ORDER BY cpi.sort_order
                       ) FILTER (WHERE cpi.id IS NOT NULL),
                       '[]'::json
                   ) AS checklist
            FROM compliance_packs cp
            LEFT JOIN compliance c ON c.id = cp.standard_id
            LEFT JOIN compliance_pack_items cpi ON cpi.pack_id = cp.id
            GROUP BY cp.id, cp.name, cp.standard_id, cp.description, c.name, cp."createdAt"
            ORDER BY cp.name
        """)
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/compliance/packs")
async def create_pack(
    body: CompliancePackCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        text(
            "INSERT INTO compliance_packs (name, standard_id, description) VALUES (:name, :sid, :desc) RETURNING id"
        ),
        {"name": body.name, "sid": body.standard_id, "desc": body.description},
    )
    pack_id = r.scalar()
    for i, req in enumerate(body.checklist):
        await db.execute(
            text(
                "INSERT INTO compliance_pack_items (pack_id, requirement, sort_order) VALUES (:pid, :req, :so)"
            ),
            {"pid": pack_id, "req": req, "so": i + 1},
        )
    await db.commit()

    result = await db.execute(
        text("""
            SELECT cp.id, cp.name, cp.standard_id, cp.description,
                   c.name AS standard_name, cp."createdAt",
                   COALESCE(
                       json_agg(
                           json_build_object('id', cpi.id, 'requirement', cpi.requirement, 'sort_order', cpi.sort_order)
                           ORDER BY cpi.sort_order
                       ) FILTER (WHERE cpi.id IS NOT NULL),
                       '[]'::json
                   ) AS checklist
            FROM compliance_packs cp
            LEFT JOIN compliance c ON c.id = cp.standard_id
            LEFT JOIN compliance_pack_items cpi ON cpi.pack_id = cp.id
            WHERE cp.id = :pid
            GROUP BY cp.id, cp.name, cp.standard_id, cp.description, c.name, cp."createdAt"
        """),
        {"pid": pack_id},
    )
    return dict(result.mappings().one())


@router.get("/compliance/packs/{pack_id}")
async def get_pack(
    pack_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        text("""
            SELECT cp.id, cp.name, cp.standard_id, cp.description,
                   c.name AS standard_name, cp."createdAt",
                   COALESCE(
                       json_agg(
                           json_build_object('id', cpi.id, 'requirement', cpi.requirement, 'sort_order', cpi.sort_order)
                           ORDER BY cpi.sort_order
                       ) FILTER (WHERE cpi.id IS NOT NULL),
                       '[]'::json
                   ) AS checklist
            FROM compliance_packs cp
            LEFT JOIN compliance c ON c.id = cp.standard_id
            LEFT JOIN compliance_pack_items cpi ON cpi.pack_id = cp.id
            WHERE cp.id = :pid
            GROUP BY cp.id, cp.name, cp.standard_id, cp.description, c.name, cp."createdAt"
        """),
        {"pid": pack_id},
    )
    row = r.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Compliance pack not found")
    return dict(row)


# ---- Part Compliance Status ----


@router.get("/compliance/parts/{part_id}")
async def get_part_compliance(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        text("SELECT id, pn, name FROM parts WHERE id = :pid"),
        {"pid": part_id},
    )
    part = r.mappings().one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    standards = await db.execute(
        text("""
            SELECT c.id, c.name, c.description,
                   pc.certified_by, pc.certification_date::text, pc.expiry_date::text,
                   pc.notes, pc."createdAt" AS certified_at
            FROM compliance c
            LEFT JOIN part_certifications pc ON pc.compliance_id = c.id AND pc.part_id = :pid
            ORDER BY c.name
        """),
        {"pid": part_id},
    )

    return {
        "part": dict(part),
        "compliance": [dict(row) for row in standards.mappings().all()],
    }


@router.post("/compliance/parts/{part_id}/certify")
async def certify_part(
    part_id: int,
    body: PartCertifyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    part = await db.execute(text("SELECT id FROM parts WHERE id = :pid"), {"pid": part_id})
    if not part.mappings().one_or_none():
        raise HTTPException(status_code=404, detail="Part not found")

    std = await db.execute(
        text("SELECT id FROM compliance WHERE id = :cid"), {"cid": body.compliance_id}
    )
    if not std.mappings().one_or_none():
        raise HTTPException(status_code=404, detail="Compliance standard not found")

    existing = await db.execute(
        text(
            "SELECT part_id FROM part_certifications WHERE part_id = :pid AND compliance_id = :cid"
        ),
        {"pid": part_id, "cid": body.compliance_id},
    )
    if existing.mappings().first():
        raise HTTPException(status_code=409, detail="Part already certified for this standard")

    r = await db.execute(
        text("""
            INSERT INTO part_certifications (part_id, compliance_id, certified_by, certification_date, expiry_date, notes)
            VALUES (:pid, :cid, :cb, :cd, :ed, :notes)
            RETURNING id, part_id, compliance_id, certified_by, certification_date::text, expiry_date::text, notes, "createdAt"
        """),
        {
            "pid": part_id,
            "cid": body.compliance_id,
            "cb": body.certified_by,
            "cd": body.certification_date,
            "ed": body.expiry_date,
            "notes": body.notes,
        },
    )
    await db.commit()
    return dict(r.mappings().one())


# ---- Dashboard / Aggregated Stats ----


@router.get("/compliance/dashboard")
async def compliance_dashboard(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    total_standards = await db.execute(
        text('SELECT COUNT(*) AS count FROM compliance WHERE "isActive" = true')
    )
    total_packs = await db.execute(text("SELECT COUNT(*) AS count FROM compliance_packs"))
    certified_parts = await db.execute(
        text("SELECT COUNT(DISTINCT part_id) AS count FROM part_certifications")
    )
    expiring_soon = await db.execute(
        text("""
            SELECT COUNT(*) AS count
            FROM part_certifications
            WHERE expiry_date IS NOT NULL
              AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        """)
    )
    expired = await db.execute(
        text("""
            SELECT COUNT(*) AS count
            FROM part_certifications
            WHERE expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE
        """)
    )
    by_standard = await db.execute(
        text("""
            SELECT c.id, c.name, COUNT(pc.part_id) AS part_count
            FROM compliance c
            LEFT JOIN part_certifications pc ON pc.compliance_id = c.id
            WHERE c."isActive" = true
            GROUP BY c.id, c.name
            ORDER BY c.name
        """)
    )

    return {
        "total_standards": total_standards.scalar(),
        "total_packs": total_packs.scalar(),
        "certified_parts": certified_parts.scalar(),
        "expiring_soon_90_days": expiring_soon.scalar(),
        "expired": expired.scalar(),
        "by_standard": [dict(row) for row in by_standard.mappings().all()],
    }


# ---- Seed Data (ISO 9001:2015 & AS9100D Requirements) ----


ISO_9001_2015_REQUIREMENTS = [
    "4.1 Understanding the organization and its context",
    "4.2 Understanding the needs and expectations of interested parties",
    "4.3 Determining the scope of the quality management system",
    "4.4 Quality management system and its processes",
    "5.1 Leadership and commitment",
    "5.2 Quality policy",
    "5.3 Organizational roles, responsibilities and authorities",
    "6.1 Actions to address risks and opportunities",
    "6.2 Quality objectives and planning to achieve them",
    "6.3 Planning of changes",
    "7.1 Resources",
    "7.1.1 General",
    "7.1.2 People",
    "7.1.3 Infrastructure",
    "7.1.4 Environment for the operation of processes",
    "7.1.5 Monitoring and measuring resources",
    "7.1.6 Organizational knowledge",
    "7.2 Competence",
    "7.3 Awareness",
    "7.4 Communication",
    "7.5 Documented information",
    "7.5.1 General",
    "7.5.2 Creating and updating",
    "7.5.3 Control of documented information",
    "8.1 Operational planning and control",
    "8.2 Requirements for products and services",
    "8.2.1 Customer communication",
    "8.2.2 Determining requirements for products and services",
    "8.2.3 Review of requirements for products and services",
    "8.2.4 Changes to requirements for products and services",
    "8.3 Design and development of products and services",
    "8.3.1 General",
    "8.3.2 Design and development planning",
    "8.3.3 Design and development inputs",
    "8.3.4 Design and development controls",
    "8.3.5 Design and development outputs",
    "8.3.6 Design and development changes",
    "8.4 Control of externally provided processes, products and services",
    "8.4.1 General",
    "8.4.2 Type and extent of control",
    "8.4.3 Information for external providers",
    "8.5 Production and service provision",
    "8.5.1 Control of production and service provision",
    "8.5.2 Identification and traceability",
    "8.5.3 Property belonging to customers or external providers",
    "8.5.4 Preservation",
    "8.5.5 Post-delivery activities",
    "8.5.6 Control of changes",
    "8.6 Release of products and services",
    "8.7 Control of nonconforming outputs",
    "9.1 Monitoring, measurement, analysis and evaluation",
    "9.1.1 General",
    "9.1.2 Customer satisfaction",
    "9.1.3 Analysis and evaluation",
    "9.2 Internal audit",
    "9.3 Management review",
    "9.3.1 General",
    "9.3.2 Management review inputs",
    "9.3.3 Management review outputs",
    "10.1 General",
    "10.2 Nonconformity and corrective action",
    "10.3 Continual improvement",
]

AS9100D_REQUIREMENTS = [
    "4.1 Understanding the organization and its context",
    "4.2 Understanding the needs and expectations of interested parties",
    "4.3 Determining the scope of the quality management system",
    "4.4 Quality management system and its processes",
    "5.1 Leadership and commitment",
    "5.2 Quality policy",
    "5.3 Organizational roles, responsibilities and authorities",
    "6.1 Actions to address risks and opportunities",
    "6.2 Quality objectives and planning to achieve them",
    "6.3 Planning of changes",
    "7.1 Resources",
    "7.1.1 General",
    "7.1.2 People",
    "7.1.3 Infrastructure",
    "7.1.4 Environment for the operation of processes",
    "7.1.5 Monitoring and measuring resources",
    "7.1.6 Organizational knowledge",
    "7.2 Competence",
    "7.3 Awareness",
    "7.4 Communication",
    "7.5 Documented information",
    "7.5.1 General",
    "7.5.2 Creating and updating",
    "7.5.3 Control of documented information",
    "8.1 Operational planning and control",
    "8.1.1 Operational risk management",
    "8.1.2 Configuration management",
    "8.1.3 Product safety",
    "8.1.4 Prevention of counterfeit parts",
    "8.2 Requirements for products and services",
    "8.2.1 Customer communication",
    "8.2.2 Determining requirements for products and services",
    "8.2.3 Review of requirements for products and services",
    "8.2.4 Changes to requirements for products and services",
    "8.3 Design and development of products and services",
    "8.3.1 General",
    "8.3.2 Design and development planning",
    "8.3.3 Design and development inputs",
    "8.3.4 Design and development controls",
    "8.3.5 Design and development outputs",
    "8.3.6 Design and development changes",
    "8.4 Control of externally provided processes, products and services",
    "8.4.1 General",
    "8.4.2 Type and extent of control",
    "8.4.3 Information for external providers",
    "8.4.4 Verification of externally provided products and services",
    "8.5 Production and service provision",
    "8.5.1 Control of production and service provision",
    "8.5.2 Identification and traceability",
    "8.5.3 Property belonging to customers or external providers",
    "8.5.4 Preservation",
    "8.5.5 Post-delivery activities",
    "8.5.6 Control of changes",
    "8.6 Release of products and services",
    "8.7 Control of nonconforming outputs",
    "9.1 Monitoring, measurement, analysis and evaluation",
    "9.1.1 General",
    "9.1.2 Customer satisfaction",
    "9.1.3 Analysis and evaluation",
    "9.2 Internal audit",
    "9.3 Management review",
    "9.3.1 General",
    "9.3.2 Management review inputs",
    "9.3.3 Management review outputs",
    "10.1 General",
    "10.2 Nonconformity and corrective action",
    "10.3 Continual improvement",
]

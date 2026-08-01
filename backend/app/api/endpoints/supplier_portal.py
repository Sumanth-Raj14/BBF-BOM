import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.security import create_access_token, get_password_hash, verify_password, verify_token
from app.db.session import get_db
from app.models.po_models import POLineItem
from app.models.supplier_portal import SupplierPriceUpdate, SupplierUser
from app.models.user import User
from app.schemas.supplier_portal import (
    SupplierLoginRequest,
    SupplierLoginResponse,
    SupplierPriceUpdateCreate,
    SupplierPriceUpdateListResponse,
    SupplierPriceUpdateResponse,
    SupplierUserCreate,
    SupplierUserResponse,
)

router = APIRouter()
supplier_auth_scheme = HTTPBearer(auto_error=False)


async def get_current_supplier_user(
    credentials: HTTPAuthorizationCredentials = Security(supplier_auth_scheme),
    db: AsyncSession = Depends(get_db),
) -> SupplierUser:
    # 403, NOT 401: these endpoints use a separate supplier-token realm. A
    # normal logged-in app user who lands here (e.g. an admin opening the
    # supplier-portal screen) is *authenticated* — just not with a supplier
    # token. Returning 401 made the app's shared API client treat it as an
    # expired session (refresh -> fail -> logout), silently logging admins out
    # whenever the supplier-portal screen loaded. 403 = "no access", which the
    # client surfaces without killing the session. Suppliers themselves get
    # their errors handled by the portal's own login flow.
    credentials_exception = HTTPException(
        status_code=403, detail="Supplier authentication required"
    )
    if not credentials:
        raise credentials_exception
    payload = verify_token(credentials.credentials)
    if payload is None:
        raise credentials_exception
    sub = payload.get("sub")
    if sub is None or not sub.startswith("supplier_"):
        raise credentials_exception
    try:
        user_id = int(sub[len("supplier_") :])
    except (ValueError, TypeError):
        raise credentials_exception
    result = await db.execute(select(SupplierUser).where(SupplierUser.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.active:
        raise credentials_exception
    return user


def _hash_password(password: str) -> str:
    return get_password_hash(password)


@router.post("/login", response_model=SupplierLoginResponse)
async def supplier_login(data: SupplierLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SupplierUser).where(
            SupplierUser.email == data.email,
            SupplierUser.active,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Try bcrypt first, fall back to legacy SHA-256 for backward compatibility
    password_valid = False
    if user.passwordHash.startswith("$2"):
        password_valid = verify_password(data.password, user.passwordHash)
    else:
        password_valid = hashlib.sha256(data.password.encode()).hexdigest() == user.passwordHash
        if password_valid:
            user.passwordHash = get_password_hash(data.password)
            await db.commit()

    if not password_valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(
        data={"sub": f"supplier_{user.id}"},
        expires_delta=timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    user.lastLoginAt = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    return SupplierLoginResponse(
        access_token=access_token,
        user=SupplierUserResponse(
            id=user.id,
            vendorId=user.vendorId,
            email=user.email,
            name=user.name,
            active=user.active,
            lastLoginAt=str(user.lastLoginAt) if user.lastLoginAt else None,
            createdAt=str(user.createdAt) if user.createdAt else None,
        ),
    )


@router.get("/users", response_model=list[SupplierUserResponse])
async def list_supplier_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SupplierUser)
        .where(SupplierUser.tenantId == current_user.tenantId)
        .order_by(SupplierUser.id)
    )
    users = result.scalars().all()
    return [
        SupplierUserResponse(
            id=u.id,
            vendorId=u.vendorId,
            email=u.email,
            name=u.name,
            active=u.active,
            lastLoginAt=str(u.lastLoginAt) if u.lastLoginAt else None,
            createdAt=str(u.createdAt) if u.createdAt else None,
        )
        for u in users
    ]


@router.post("/users", response_model=SupplierUserResponse)
async def create_supplier_user(
    data: SupplierUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await db.execute(select(SupplierUser).where(SupplierUser.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = SupplierUser(
        vendorId=data.vendorId,
        email=data.email,
        name=data.name,
        passwordHash=_hash_password(data.password),
        tenantId=current_user.tenantId,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return SupplierUserResponse(
        id=user.id,
        vendorId=user.vendorId,
        email=user.email,
        name=user.name,
        active=user.active,
        createdAt=str(user.createdAt) if user.createdAt else None,
    )


@router.get("/price-updates", response_model=SupplierPriceUpdateListResponse)
async def list_price_updates(
    status: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: SupplierUser = Depends(get_current_supplier_user),
):
    query = select(SupplierPriceUpdate).where(SupplierPriceUpdate.supplierUserId == current_user.id)
    if status:
        query = query.where(SupplierPriceUpdate.status == status)
    query = query.order_by(SupplierPriceUpdate.createdAt.desc())
    result = await db.execute(query)
    updates = result.scalars().all()
    return SupplierPriceUpdateListResponse(
        total=len(updates),
        items=[
            SupplierPriceUpdateResponse(
                id=u.id,
                supplierUserId=u.supplierUserId,
                partId=u.partId,
                oldPrice=u.oldPrice,
                newPrice=u.newPrice,
                status=u.status,
                createdAt=str(u.createdAt) if u.createdAt else None,
                reviewedAt=str(u.reviewedAt) if u.reviewedAt else None,
            )
            for u in updates
        ],
    )


@router.post("/price-updates", response_model=SupplierPriceUpdateResponse)
async def submit_price_update(
    data: SupplierPriceUpdateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: SupplierUser = Depends(get_current_supplier_user),
):
    # Get current price from latest PO line item for this part
    old_price = 0.0
    price_result = await db.execute(
        select(POLineItem)
        .where(POLineItem.itemName.ilike(f"%{data.partId}%"))
        .order_by(POLineItem.id.desc())
        .limit(1)
    )
    last_item = price_result.scalar_one_or_none()
    if last_item:
        old_price = last_item.itemPrice

    update = SupplierPriceUpdate(
        supplierUserId=current_user.id,
        partId=data.partId,
        oldPrice=old_price,
        newPrice=data.newPrice,
        status="pending",
        tenantId=current_user.tenantId,
    )
    db.add(update)
    await db.commit()
    await db.refresh(update)

    return SupplierPriceUpdateResponse(
        id=update.id,
        supplierUserId=update.supplierUserId,
        partId=update.partId,
        oldPrice=update.oldPrice,
        newPrice=update.newPrice,
        status=update.status,
        createdAt=str(update.createdAt) if update.createdAt else None,
        reviewedAt=str(update.reviewedAt) if update.reviewedAt else None,
    )


# ============ RFQ Workflow ============


from app.models.part import Part
from app.models.supplier_portal import RfqHeader, RfqLineItem, RfqSupplierResponse
from app.models.vendor import Vendor
from app.schemas.supplier_portal import (
    RfqCreate,
    RfqListResponse,
    RfqRespondRequest,
    RfqRespondResponse,
    RfqResponse,
)


def _generate_rfq_number(tenant_id: int) -> str:
    import secrets

    return f"RFQ-{tenant_id}-{secrets.token_hex(4).upper()}"


@router.get("/rfqs", response_model=RfqListResponse)
async def list_rfqs(
    status: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(RfqHeader).where(RfqHeader.tenantId == current_user.tenantId)
    if status:
        query = query.where(RfqHeader.status == status)
    query = query.order_by(RfqHeader.created_at.desc())
    result = await db.execute(query)
    rfqs = result.scalars().all()
    resp_map = await _load_rfq_responses(
        db, [r.id for r in rfqs], current_user.tenantId
    )
    return RfqListResponse(
        total=len(rfqs),
        items=[_rfq_to_response(r, resp_map.get(r.id)) for r in rfqs],
    )


@router.post("/rfqs", response_model=RfqResponse)
async def create_rfq(
    data: RfqCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rfq = RfqHeader(
        rfq_number=_generate_rfq_number(current_user.tenantId),
        title=data.title,
        description=data.description,
        status="draft",
        response_deadline=data.response_deadline,
        created_by=current_user.id,
        tenantId=current_user.tenantId,
    )
    db.add(rfq)
    await db.flush()

    if data.line_items:
        for li in data.line_items:
            line = RfqLineItem(
                rfq_id=rfq.id,
                part_id=li.part_id,
                quantity=li.quantity,
                target_price=li.target_price,
                notes=li.notes,
                tenantId=current_user.tenantId,
            )
            db.add(line)
    await db.commit()
    await db.refresh(rfq)
    return _rfq_to_response(rfq)


@router.get("/rfqs/{rfq_id}", response_model=RfqResponse)
async def get_rfq(
    rfq_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RfqHeader).where(RfqHeader.id == rfq_id, RfqHeader.tenantId == current_user.tenantId)
    )
    rfq = result.scalar_one_or_none()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    resp_map = await _load_rfq_responses(db, [rfq.id], current_user.tenantId)
    return _rfq_to_response(rfq, resp_map.get(rfq.id))


@router.post("/rfqs/{rfq_id}/respond", response_model=RfqRespondResponse)
async def respond_to_rfq(
    rfq_id: int,
    data: RfqRespondRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SupplierUser = Depends(get_current_supplier_user),
):
    rfq_result = await db.execute(select(RfqHeader).where(RfqHeader.id == rfq_id))
    rfq = rfq_result.scalar_one_or_none()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")

    response = RfqSupplierResponse(
        rfq_id=rfq_id,
        supplier_user_id=current_user.id,
        line_item_id=data.line_item_id,
        quoted_price=data.quoted_price,
        quoted_lead_time_days=data.quoted_lead_time_days,
        notes=data.notes,
        tenantId=rfq.tenantId,
    )
    db.add(response)

    rfq.status = "responded"
    await db.commit()
    await db.refresh(response)
    return RfqRespondResponse(
        id=response.id,
        rfq_id=response.rfq_id,
        line_item_id=response.line_item_id,
        quoted_price=response.quoted_price,
        quoted_lead_time_days=response.quoted_lead_time_days,
        status=response.status,
        submitted_at=str(response.submitted_at) if response.submitted_at else None,
    )


@router.post("/rfqs/{rfq_id}/award")
async def award_rfq(
    rfq_id: int,
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RfqHeader).where(RfqHeader.id == rfq_id, RfqHeader.tenantId == current_user.tenantId)
    )
    rfq = result.scalar_one_or_none()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    rfq.status = "awarded"
    rfq.awarded_to_vendor_id = supplier_id
    await db.commit()
    return {"status": "awarded", "rfq_id": rfq_id, "supplier_id": supplier_id}


def _rfq_to_response(rfq: RfqHeader, responses: list | None = None) -> dict:
    return {
        "id": rfq.id,
        "rfq_number": rfq.rfq_number,
        "title": rfq.title,
        "description": rfq.description,
        "status": rfq.status,
        "issue_date": str(rfq.issue_date) if rfq.issue_date else None,
        "response_deadline": str(rfq.response_deadline) if rfq.response_deadline else None,
        "awarded_to_vendor_id": rfq.awarded_to_vendor_id,
        "created_by": rfq.created_by,
        "created_at": str(rfq.created_at) if rfq.created_at else None,
        "responses": responses or [],
    }


async def _load_rfq_responses(
    db: AsyncSession, rfq_ids: list[int], tenant_id: int
) -> dict[int, list[dict]]:
    """Return {rfq_id: [quote, ...]} for the given RFQs, resolving each
    supplier response to its vendor name and part/quantity. Tenant-scoped.
    Uses a handful of batched lookups (no N+1), and never fabricates: a
    missing vendor/part/price simply yields a null in that field."""
    if not rfq_ids:
        return {}
    rows = (
        await db.execute(
            select(RfqSupplierResponse).where(
                RfqSupplierResponse.rfq_id.in_(rfq_ids),
                RfqSupplierResponse.tenantId == tenant_id,
            )
        )
    ).scalars().all()
    if not rows:
        return {}

    su_ids = {r.supplier_user_id for r in rows}
    su_map = {
        su.id: su
        for su in (
            await db.execute(select(SupplierUser).where(SupplierUser.id.in_(su_ids)))
        ).scalars().all()
    }
    vendor_ids = {su.vendorId for su in su_map.values()}
    v_map = (
        {
            v.id: v
            for v in (
                await db.execute(select(Vendor).where(Vendor.id.in_(vendor_ids)))
            ).scalars().all()
        }
        if vendor_ids
        else {}
    )
    li_ids = {r.line_item_id for r in rows}
    li_map = {
        li.id: li
        for li in (
            await db.execute(select(RfqLineItem).where(RfqLineItem.id.in_(li_ids)))
        ).scalars().all()
    }
    part_ids = {li.part_id for li in li_map.values()}
    p_map = (
        {
            p.id: p
            for p in (
                await db.execute(select(Part).where(Part.id.in_(part_ids)))
            ).scalars().all()
        }
        if part_ids
        else {}
    )

    out: dict[int, list[dict]] = {}
    for r in rows:
        su = su_map.get(r.supplier_user_id)
        vendor = v_map.get(su.vendorId) if su else None
        vname = (
            getattr(vendor, "name", None)
            or (getattr(su, "name", None) if su else None)
            or f"Supplier {r.supplier_user_id}"
        )
        li = li_map.get(r.line_item_id)
        part = p_map.get(li.part_id) if li else None
        pname = getattr(part, "name", None) or getattr(part, "pn", None)
        qty = getattr(li, "quantity", None)
        price = float(r.quoted_price) if r.quoted_price is not None else None
        out.setdefault(r.rfq_id, []).append(
            {
                "id": r.id,
                "vendor": vname,
                "vendorName": vname,
                "supplier_user_id": r.supplier_user_id,
                "line_item_id": r.line_item_id,
                "part_id": getattr(li, "part_id", None),
                "part": pname,
                "quoted_price": price,
                "price": price,
                "unit": price,
                "quoted_lead_time_days": r.quoted_lead_time_days,
                "lead": r.quoted_lead_time_days,
                "leadTime": r.quoted_lead_time_days,
                "qty": qty,
                "quantity": qty,
                "status": r.status,
            }
        )
    return out


@router.put("/price-updates/{update_id}/approve", response_model=SupplierPriceUpdateResponse)
async def approve_price_update(
    update_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SupplierPriceUpdate).where(
            SupplierPriceUpdate.id == update_id,
            SupplierPriceUpdate.tenantId == current_user.tenantId,
        )
    )
    update = result.scalar_one_or_none()
    if not update:
        raise HTTPException(status_code=404, detail="Price update not found")
    update.status = "approved"
    update.reviewedAt = datetime.now(UTC)
    await db.commit()
    await db.refresh(update)
    return SupplierPriceUpdateResponse(
        id=update.id,
        supplierUserId=update.supplierUserId,
        partId=update.partId,
        oldPrice=update.oldPrice,
        newPrice=update.newPrice,
        status=update.status,
        createdAt=str(update.createdAt) if update.createdAt else None,
        reviewedAt=str(update.reviewedAt) if update.reviewedAt else None,
    )


@router.put("/price-updates/{update_id}/reject", response_model=SupplierPriceUpdateResponse)
async def reject_price_update(
    update_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SupplierPriceUpdate).where(
            SupplierPriceUpdate.id == update_id,
            SupplierPriceUpdate.tenantId == current_user.tenantId,
        )
    )
    update = result.scalar_one_or_none()
    if not update:
        raise HTTPException(status_code=404, detail="Price update not found")
    update.status = "rejected"
    update.reviewedAt = datetime.now(UTC)
    await db.commit()
    await db.refresh(update)
    return SupplierPriceUpdateResponse(
        id=update.id,
        supplierUserId=update.supplierUserId,
        partId=update.partId,
        oldPrice=update.oldPrice,
        newPrice=update.newPrice,
        status=update.status,
        createdAt=str(update.createdAt) if update.createdAt else None,
        reviewedAt=str(update.reviewedAt) if update.reviewedAt else None,
    )

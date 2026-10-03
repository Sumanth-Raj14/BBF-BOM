from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.erp_connector import ERPConnector, ERPSyncLog
from app.models.user import User
from app.schemas.erp_connector import (
    ERPConnectorCreate,
    ERPConnectorListResponse,
    ERPConnectorResponse,
    ERPConnectorUpdate,
    ERPSyncLogResponse,
    ERPSyncRequest,
    ERPTestConnectionRequest,
)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("", response_model=ERPConnectorListResponse)
async def list_connectors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ERPConnector).order_by(ERPConnector.createdAt.desc()))
    connectors = result.scalars().all()
    return ERPConnectorListResponse(
        total=len(connectors),
        items=[
            ERPConnectorResponse(
                id=c.id,
                name=c.name,
                type=c.type,
                baseUrl=c.baseUrl,
                apiKey=c.apiKey[:4] + "****" if c.apiKey and len(c.apiKey) > 4 else "****",
                active=c.active,
                config=c.config,
                lastSyncAt=str(c.lastSyncAt) if c.lastSyncAt else None,
                createdAt=str(c.createdAt) if c.createdAt else None,
            )
            for c in connectors
        ],
    )


@router.post("", response_model=ERPConnectorResponse)
async def create_connector(
    data: ERPConnectorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    connector = ERPConnector(
        name=data.name,
        type=data.type,
        baseUrl=data.baseUrl,
        apiKey=data.apiKey,
        active=data.active,
        config=data.config or {},
        tenantId=current_user.tenantId,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return ERPConnectorResponse(
        id=connector.id,
        name=connector.name,
        type=connector.type,
        baseUrl=connector.baseUrl,
        apiKey=connector.apiKey[:4] + "****"
        if connector.apiKey and len(connector.apiKey) > 4
        else "****",
        active=connector.active,
        config=connector.config,
        lastSyncAt=str(connector.lastSyncAt) if connector.lastSyncAt else None,
        createdAt=str(connector.createdAt) if connector.createdAt else None,
    )


@router.get("/{connector_id}", response_model=ERPConnectorResponse)
async def get_connector(connector_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ERPConnector).where(ERPConnector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    return ERPConnectorResponse(
        id=connector.id,
        name=connector.name,
        type=connector.type,
        baseUrl=connector.baseUrl,
        apiKey=connector.apiKey[:4] + "****"
        if connector.apiKey and len(connector.apiKey) > 4
        else "****",
        active=connector.active,
        config=connector.config,
        lastSyncAt=str(connector.lastSyncAt) if connector.lastSyncAt else None,
        createdAt=str(connector.createdAt) if connector.createdAt else None,
    )


@router.put("/{connector_id}", response_model=ERPConnectorResponse)
async def update_connector(
    connector_id: int, data: ERPConnectorUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ERPConnector).where(ERPConnector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(connector, k, v)
    await db.commit()
    await db.refresh(connector)
    return ERPConnectorResponse(
        id=connector.id,
        name=connector.name,
        type=connector.type,
        baseUrl=connector.baseUrl,
        apiKey=connector.apiKey[:4] + "****"
        if connector.apiKey and len(connector.apiKey) > 4
        else "****",
        active=connector.active,
        config=connector.config,
        lastSyncAt=str(connector.lastSyncAt) if connector.lastSyncAt else None,
        createdAt=str(connector.createdAt) if connector.createdAt else None,
    )


@router.patch("/{connector_id}", response_model=ERPConnectorResponse)
async def patch_connector(
    connector_id: int,
    data: ERPConnectorUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await update_connector(connector_id, data, db)


@router.delete("/{connector_id}")
async def delete_connector(connector_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ERPConnector).where(ERPConnector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    await db.delete(connector)
    await db.commit()
    return {"status": "deleted"}


@router.post("/{connector_id}/sync", response_model=ERPSyncLogResponse)
async def sync_connector(
    connector_id: int,
    data: ERPSyncRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ERPConnector).where(ERPConnector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # HONESTY (R10): No real ERP integration exists yet — nothing is actually
    # transmitted to/from the external system. Previously this logged
    # status="completed" and bumped lastSyncAt even though zero records were
    # ever exchanged, which made the UI falsely report a successful sync.
    # Log it as "failed" (an allowed status) with an explanatory error instead
    # of claiming success, and leave lastSyncAt untouched since no sync ran.
    log = ERPSyncLog(
        connectorId=connector.id,
        direction=data.direction,
        entityType=data.entityType,
        recordsCount=0,
        status="failed",
        errors=(
            "ERP sync is not implemented for this connector type — no network "
            "call was made and no records were exchanged."
        ),
        tenantId=current_user.tenantId,
    )
    db.add(log)

    await db.commit()
    await db.refresh(log)

    return ERPSyncLogResponse(
        id=log.id,
        connectorId=log.connectorId,
        direction=log.direction,
        entityType=log.entityType,
        recordsCount=log.recordsCount,
        status=log.status,
        errors=log.errors,
        createdAt=str(log.createdAt) if log.createdAt else None,
    )


@router.get("/{connector_id}/logs", response_model=list[ERPSyncLogResponse])
async def get_sync_logs(
    connector_id: int,
    response: Response,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Newest-first sync log for one connector, capped.

    This used to SELECT the whole table. erp_sync_logs gains a row per sync run
    forever, so on a connector polling every few minutes the response grows
    without bound until the request OOMs the worker and takes the instance down
    with it -- and the older the deployment, the likelier that becomes.

    The cap is not silent: X-Total-Count carries the true number of rows, so a
    caller can tell "100 logs" from "the first 100 of 40,000" and page with
    offset. Truncating without saying so would just move the failure from a
    crash to a wrong answer.
    """
    total = (
        await db.execute(
            select(func.count())
            .select_from(ERPSyncLog)
            .where(ERPSyncLog.connectorId == connector_id)
        )
    ).scalar_one()
    response.headers["X-Total-Count"] = str(total)

    result = await db.execute(
        select(ERPSyncLog)
        .where(ERPSyncLog.connectorId == connector_id)
        .order_by(ERPSyncLog.createdAt.desc())
        .limit(limit)
        .offset(offset)
    )
    logs = result.scalars().all()
    return [
        ERPSyncLogResponse(
            id=log_entry.id,
            connectorId=log_entry.connectorId,
            direction=log_entry.direction,
            entityType=log_entry.entityType,
            recordsCount=log_entry.recordsCount,
            status=log_entry.status,
            errors=log_entry.errors,
            createdAt=str(log_entry.createdAt) if log_entry.createdAt else None,
        )
        for log_entry in logs
    ]


@router.post("/test-connection")
async def test_connection(data: ERPTestConnectionRequest):
    # HONESTY (R10): no real network call is made to data.baseUrl — this
    # previously reported status="success" unconditionally, which misled
    # users into believing connectivity had actually been verified.
    return {
        "status": "simulated",
        "message": (
            f"Connection test to {data.baseUrl} was simulated — no real network "
            "call was made. ERP connectivity testing is not yet implemented."
        ),
        "baseUrl": data.baseUrl,
    }


@router.post("/{connector_id}/test-connection")
async def test_connection_by_id(connector_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ERPConnector).where(ERPConnector.id == connector_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    # HONESTY (R10): see test_connection() above — no real network call is made.
    return {
        "status": "simulated",
        "message": (
            f"Connection test to {connector.baseUrl} was simulated — no real "
            "network call was made. ERP connectivity testing is not yet implemented."
        ),
        "baseUrl": connector.baseUrl,
    }

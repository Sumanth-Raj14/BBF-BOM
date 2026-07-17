"""User data sync API — bridges frontend localStorage with PostgreSQL."""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


class DataStoreEntry(BaseModel):
    data_key: str
    data_value: Any


class DataStoreResponse(BaseModel):
    data_key: str
    data_value: Any
    data_version: int


class PreferenceEntry(BaseModel):
    pref_key: str
    pref_value: str
    pref_type: str = "string"


class ChecklistUpdate(BaseModel):
    completed_items: list
    dismissed: bool = False


class BomDraftUpdate(BaseModel):
    draft_name: str = "default"
    rows_data: list
    conversion_rate: float = 83.0


class ScanEntry(BaseModel):
    barcode_data: str
    scan_result: Optional[dict] = None


class SavedSearchEntry(BaseModel):
    search_name: str
    search_params: dict
    is_default: bool = False


@router.get("/data-store", response_model=list[DataStoreResponse])
async def get_all_data_store(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT data_key, data_value, data_version FROM user_data_store WHERE user_id = :uid"),
        {"uid": current_user.id},
    )
    rows = result.fetchall()
    return [DataStoreResponse(data_key=r[0], data_value=r[1], data_version=r[2]) for r in rows]


@router.get("/data-store/{data_key}", response_model=DataStoreResponse)
async def get_data_store_entry(
    data_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text(
            "SELECT data_key, data_value, data_version FROM user_data_store WHERE user_id = :uid AND data_key = :key"
        ),
        {"uid": current_user.id, "key": data_key},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Key not found")
    return DataStoreResponse(data_key=row[0], data_value=row[1], data_version=row[2])


@router.put("/data-store/{data_key}", response_model=DataStoreResponse)
async def upsert_data_store(
    data_key: str,
    entry: DataStoreEntry,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("""
            INSERT INTO user_data_store (user_id, data_key, data_value, data_version)
            VALUES (:uid, :key, :val::jsonb, 1)
            ON CONFLICT (user_id, data_key)
            DO UPDATE SET data_value = :val::jsonb,
                          data_version = user_data_store.data_version + 1,
                          updated_at = CURRENT_TIMESTAMP
            RETURNING data_key, data_value, data_version
        """),
        {"uid": current_user.id, "key": data_key, "val": entry.data_value},
    )
    await db.commit()
    row = result.first()
    return DataStoreResponse(data_key=row[0], data_value=row[1], data_version=row[2])


@router.delete("/data-store/{data_key}")
async def delete_data_store(
    data_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text("DELETE FROM user_data_store WHERE user_id = :uid AND data_key = :key"),
        {"uid": current_user.id, "key": data_key},
    )
    await db.commit()
    return {"deleted": True}


@router.post("/sync-all")
async def sync_all_data(
    data: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    synced = []
    for key, value in data.items():
        await db.execute(
            text("""
                INSERT INTO user_data_store (user_id, data_key, data_value, data_version)
                VALUES (:uid, :key, :val::jsonb, 1)
                ON CONFLICT (user_id, data_key)
                DO UPDATE SET data_value = :val::jsonb,
                              data_version = user_data_store.data_version + 1,
                              updated_at = CURRENT_TIMESTAMP
            """),
            {"uid": current_user.id, "key": key, "val": value},
        )
        synced.append(key)
    await db.commit()
    return {"synced_keys": synced, "count": len(synced)}


@router.get("/export-all", response_model=dict[str, Any])
async def export_all_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT data_key, data_value FROM user_data_store WHERE user_id = :uid"),
        {"uid": current_user.id},
    )
    return {row[0]: row[1] for row in result.fetchall()}


@router.get("/preferences", response_model=list[PreferenceEntry])
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT pref_key, pref_value, pref_type FROM user_preferences WHERE user_id = :uid"),
        {"uid": current_user.id},
    )
    rows = result.fetchall()
    return [PreferenceEntry(pref_key=r[0], pref_value=r[1], pref_type=r[2]) for r in rows]


@router.put("/preferences/{pref_key}", response_model=PreferenceEntry)
async def upsert_preference(
    pref_key: str,
    entry: PreferenceEntry,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text("""
            INSERT INTO user_preferences (user_id, pref_key, pref_value, pref_type)
            VALUES (:uid, :key, :val, :typ)
            ON CONFLICT (user_id, pref_key)
            DO UPDATE SET pref_value = :val, pref_type = :typ, updated_at = CURRENT_TIMESTAMP
        """),
        {
            "uid": current_user.id,
            "key": pref_key,
            "val": entry.pref_value,
            "typ": entry.pref_type,
        },
    )
    await db.commit()
    return entry


@router.get("/checklist", response_model=ChecklistUpdate)
async def get_checklist(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT completed_items, dismissed FROM user_checklist_progress WHERE user_id = :uid"),
        {"uid": current_user.id},
    )
    row = result.first()
    if not row:
        return ChecklistUpdate(completed_items=[], dismissed=False)
    return ChecklistUpdate(completed_items=row[0], dismissed=row[1])


@router.put("/checklist", response_model=ChecklistUpdate)
async def update_checklist(
    entry: ChecklistUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text("""
            INSERT INTO user_checklist_progress (user_id, completed_items, dismissed)
            VALUES (:uid, :items::jsonb, :dismissed)
            ON CONFLICT (user_id)
            DO UPDATE SET completed_items = :items::jsonb,
                          dismissed = :dismissed,
                          updated_at = CURRENT_TIMESTAMP
        """),
        {
            "uid": current_user.id,
            "items": entry.completed_items,
            "dismissed": entry.dismissed,
        },
    )
    await db.commit()
    return entry


@router.get("/bom-draft", response_model=Optional[BomDraftUpdate])
async def get_bom_draft(
    draft_name: str = "default",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text(
            "SELECT draft_name, rows_data, conversion_rate FROM bom_drafts WHERE user_id = :uid AND draft_name = :name"
        ),
        {"uid": current_user.id, "name": draft_name},
    )
    row = result.first()
    if not row:
        return None
    return BomDraftUpdate(draft_name=row[0], rows_data=row[1], conversion_rate=float(row[2]))


@router.put("/bom-draft", response_model=BomDraftUpdate)
async def save_bom_draft(
    entry: BomDraftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text("""
            INSERT INTO bom_drafts (user_id, draft_name, rows_data, conversion_rate, version)
            VALUES (:uid, :name, :rows::jsonb, :rate, 1)
            ON CONFLICT (user_id, draft_name)
            DO UPDATE SET rows_data = :rows::jsonb,
                          conversion_rate = :rate,
                          version = bom_drafts.version + 1,
                          updated_at = CURRENT_TIMESTAMP
        """),
        {
            "uid": current_user.id,
            "name": entry.draft_name,
            "rows": entry.rows_data,
            "rate": entry.conversion_rate,
        },
    )
    await db.commit()
    return entry


@router.get("/scan-history", response_model=list[dict])
async def get_scan_history(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text(
            "SELECT barcode_data, scan_result, scanned_at FROM scan_history WHERE user_id = :uid ORDER BY scanned_at DESC LIMIT :lim"
        ),
        {"uid": current_user.id, "lim": limit},
    )
    return [
        {
            "barcode": r[0],
            "result": r[1],
            "scanned_at": r[2].isoformat() if r[2] else None,
        }
        for r in result.fetchall()
    ]


@router.post("/scan-history", response_model=dict)
async def add_scan_entry(
    entry: ScanEntry,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            "INSERT INTO scan_history (user_id, barcode_data, scan_result) VALUES (:uid, :bc, :result::jsonb)"
        ),
        {"uid": current_user.id, "bc": entry.barcode_data, "result": entry.scan_result},
    )
    await db.commit()
    return {"saved": True}


@router.get("/saved-searches", response_model=list[SavedSearchEntry])
async def get_saved_searches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text(
            "SELECT search_name, search_params, is_default FROM saved_searches WHERE user_id = :uid ORDER BY created_at"
        ),
        {"uid": current_user.id},
    )
    rows = result.fetchall()
    return [SavedSearchEntry(search_name=r[0], search_params=r[1], is_default=r[2]) for r in rows]


@router.put("/saved-searches/{search_name}", response_model=SavedSearchEntry)
async def save_search(
    search_name: str,
    entry: SavedSearchEntry,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text("""
            INSERT INTO saved_searches (user_id, search_name, search_params, is_default)
            VALUES (:uid, :name, :params::jsonb, :def)
            ON CONFLICT (user_id, search_name)
            DO UPDATE SET search_params = :params::jsonb, is_default = :def
        """),
        {
            "uid": current_user.id,
            "name": search_name,
            "params": entry.search_params,
            "def": entry.is_default,
        },
    )
    await db.commit()
    return entry


@router.delete("/saved-searches/{search_name}")
async def delete_search(
    search_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text("DELETE FROM saved_searches WHERE user_id = :uid AND search_name = :name"),
        {"uid": current_user.id, "name": search_name},
    )
    await db.commit()
    return {"deleted": True}

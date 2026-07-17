"""Backup system tests — pure unit tests that don't require PostgreSQL."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.backup import BackupType, create_backup


@pytest.fixture
def mock_db_session():
    session = MagicMock()
    session.__aenter__.return_value = session
    session.__aexit__.return_value = None
    maker = AsyncMock()
    maker.return_value = session
    return maker


@pytest.mark.asyncio
async def test_determine_retention_tier():
    from app.core.backup import RetentionTier, determine_retention_tier

    tier = determine_retention_tier()
    assert tier in RetentionTier


@pytest.mark.asyncio
async def test_get_fernet_deterministic():
    from app.core.backup import _get_fernet

    f1 = _get_fernet()
    f2 = _get_fernet()
    data = b"test data for backup encryption"
    token = f1.encrypt(data)
    decrypted = f2.decrypt(token)
    assert decrypted == data


@pytest.mark.asyncio
async def test_restore_backup_nonexistent_file():
    from app.core.backup import restore_backup

    result = await restore_backup("/nonexistent/path.dump")
    assert result["success"] is False
    assert result["error"] is not None


@pytest.mark.asyncio
async def test_backup_fails_when_not_found(mock_db_session):
    with patch("app.core.backup._find_pg_dump", side_effect=RuntimeError("not found")):
        with patch("app.core.backup.get_session_maker", new=mock_db_session):
            result = await create_backup(BackupType.FULL)
            assert result.status == "failed"


@pytest.mark.asyncio
async def test_backup_s3_storage_type_propagated(mock_db_session):
    with patch("app.core.backup._find_pg_dump", side_effect=RuntimeError("not found")):
        with patch("app.core.backup.get_session_maker", new=mock_db_session):
            result = await create_backup(BackupType.FULL, storage_type="s3")
            assert result.status == "failed"
            assert result.storage_type == "s3"

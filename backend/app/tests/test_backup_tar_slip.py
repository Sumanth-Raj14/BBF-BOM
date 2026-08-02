"""Regression test for audit finding A7 — tar slip on physical-backup restore.

restore_physical_backup() extracted the archive with a bare
`tar.extractall(path=data_dir)`, which honours whatever paths the archive
contains. A crafted or corrupt backup holding a '../' member therefore wrote
outside the data directory — during a RESTORE, running with the database's
privileges.
"""

import tarfile

import pytest


def _make_evil_archive(tmp_path):
    """A tarball whose single member escapes the extraction directory."""
    payload = tmp_path / "payload.txt"
    payload.write_text("pwned")

    archive = tmp_path / "evil.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(payload, arcname="../escaped.txt")
    return archive


def test_bare_extractall_would_escape(tmp_path):
    """Demonstrates the vulnerability the fix defends against.

    Without a filter the member lands OUTSIDE the destination. This pins why
    `filter="data"` is required rather than incidental.
    """
    archive = _make_evil_archive(tmp_path)
    dest = tmp_path / "dest"
    dest.mkdir()

    with tarfile.open(archive, "r:gz") as tar:
        tar.extractall(path=dest, filter="fully_trusted")

    assert (tmp_path / "escaped.txt").exists(), "expected the unsafe baseline to escape"
    assert not (dest / "escaped.txt").exists()


def test_data_filter_blocks_the_escape(tmp_path):
    """The filter the restore path now uses must refuse the same archive."""
    archive = _make_evil_archive(tmp_path)
    dest = tmp_path / "dest2"
    dest.mkdir()

    with tarfile.open(archive, "r:gz") as tar:
        with pytest.raises(tarfile.OutsideDestinationError):
            tar.extractall(path=dest, filter="data")

    assert not (tmp_path / "escaped.txt").exists()


def test_restore_path_uses_a_filter():
    """The production call must not regress to a bare extractall().

    Source-level assertion because exercising restore_physical_backup() needs a
    real pg_basebackup archive and a stopped cluster.
    """
    import inspect

    from app.core import backup

    source = inspect.getsource(backup.restore_physical_backup)
    assert "extractall" in source
    assert 'filter="data"' in source, (
        "restore_physical_backup must extract with filter=\"data\" (tar-slip guard)"
    )

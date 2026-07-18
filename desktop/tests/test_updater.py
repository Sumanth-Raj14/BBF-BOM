"""Unit tests for desktop/updater.py.

Runs with plain pytest, no database / network required:
    python -m pytest desktop/tests/test_updater.py -v

Covers:
- semver_compare / is_newer (pure function, all edge cases)
- SHA-256 verification (compute + verify against a known digest)
- "no network -> None" for check_for_update (local-first guarantee)
"""

import hashlib
import json
import sys
import urllib.error
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import updater  # noqa: E402


# ---------------------------------------------------------------------------
# semver_compare / parse_semver / is_newer
# ---------------------------------------------------------------------------


class TestSemverCompare:
    @pytest.mark.parametrize(
        "a, b, expected",
        [
            ("1.0.0", "1.0.0", 0),
            ("1.0.1", "1.0.0", 1),
            ("1.0.0", "1.0.1", -1),
            ("1.1.0", "1.0.9", 1),
            ("2.0.0", "1.9.9", 1),
            ("1.9.9", "2.0.0", -1),
            ("v2.1.0", "2.1.0", 0),  # leading "v" ignored
            ("2.1.0", "2.1.0+build.5", 0),  # build metadata ignored
            ("2.1.0-rc.1", "2.1.0", -1),  # prerelease < release
            ("2.1.0", "2.1.0-rc.1", 1),
            ("2.1.0-alpha", "2.1.0-beta", -1),  # alphabetic prerelease compare
            ("2.1.0-rc.2", "2.1.0-rc.10", -1),  # numeric prerelease compare (2 < 10)
            ("10.0.0", "9.0.0", 1),  # numeric, not lexicographic, comparison
        ],
    )
    def test_compare(self, a, b, expected):
        assert updater.semver_compare(a, b) == expected

    def test_invalid_semver_raises(self):
        with pytest.raises(ValueError):
            updater.semver_compare("not-a-version", "1.0.0")
        with pytest.raises(ValueError):
            updater.semver_compare("1.0.0", "1.0")

    def test_is_newer(self):
        assert updater.is_newer("2.1.1", "2.1.0") is True
        assert updater.is_newer("2.1.0", "2.1.0") is False
        assert updater.is_newer("2.0.9", "2.1.0") is False

    def test_is_newer_never_raises_on_garbage(self):
        # is_newer is used to gate prompts; unparseable input must not crash it.
        assert updater.is_newer("garbage", "2.1.0") is False
        assert updater.is_newer("2.1.0", "garbage") is False


# ---------------------------------------------------------------------------
# SHA-256 verification
# ---------------------------------------------------------------------------


class TestSha256Verify:
    def test_compute_and_verify_match(self, tmp_path):
        content = b"blackbox bom installer bytes"
        f = tmp_path / "installer.exe"
        f.write_bytes(content)

        expected = hashlib.sha256(content).hexdigest()
        assert updater.compute_sha256(f) == expected
        assert updater.verify_sha256(f, expected) is True

    def test_verify_mismatch(self, tmp_path):
        f = tmp_path / "installer.exe"
        f.write_bytes(b"real bytes")

        wrong_hash = hashlib.sha256(b"different bytes").hexdigest()
        assert updater.verify_sha256(f, wrong_hash) is False

    def test_verify_case_insensitive(self, tmp_path):
        content = b"case check"
        f = tmp_path / "installer.exe"
        f.write_bytes(content)
        expected_upper = hashlib.sha256(content).hexdigest().upper()
        assert updater.verify_sha256(f, expected_upper) is True

    def test_verify_empty_expected_hash_fails(self, tmp_path):
        f = tmp_path / "installer.exe"
        f.write_bytes(b"anything")
        assert updater.verify_sha256(f, "") is False


# ---------------------------------------------------------------------------
# check_for_update: local-first guarantee -- failures return None, never raise
# ---------------------------------------------------------------------------


def _write_version_file(tmp_path: Path, feed_url: str, version: str = "2.1.0") -> Path:
    vf = tmp_path / "version.json"
    vf.write_text(json.dumps({"version": version, "feed_url": feed_url}), encoding="utf-8")
    return vf


class TestCheckForUpdateLocalFirst:
    def test_no_network_returns_none(self, tmp_path, monkeypatch):
        vf = _write_version_file(tmp_path, "https://updates.example-real-feed.test/feed.json")

        def _raise_urlopen(*args, **kwargs):
            raise urllib.error.URLError("no network")

        monkeypatch.setattr(updater.urllib.request, "urlopen", _raise_urlopen)

        assert updater.check_for_update(version_file=vf) is None

    def test_unconfigured_placeholder_feed_returns_none_without_network_call(
        self, tmp_path, monkeypatch
    ):
        vf = _write_version_file(tmp_path, "https://REPLACE_ME.example.com/feed.json")

        called = {"count": 0}

        def _urlopen(*args, **kwargs):
            called["count"] += 1
            raise AssertionError("must not attempt network call for unconfigured feed")

        monkeypatch.setattr(updater.urllib.request, "urlopen", _urlopen)

        assert updater.check_for_update(version_file=vf) is None
        assert called["count"] == 0

    def test_missing_version_file_returns_none(self, tmp_path):
        missing = tmp_path / "does-not-exist.json"
        assert updater.check_for_update(version_file=missing) is None

    def test_malformed_feed_json_returns_none(self, tmp_path, monkeypatch):
        vf = _write_version_file(tmp_path, "https://updates.example-real-feed.test/feed.json")

        class _FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b"not valid json{{{"

        monkeypatch.setattr(
            updater.urllib.request, "urlopen", lambda *a, **k: _FakeResponse()
        )
        assert updater.check_for_update(version_file=vf) is None

    def test_feed_missing_required_field_returns_none(self, tmp_path, monkeypatch):
        vf = _write_version_file(tmp_path, "https://updates.example-real-feed.test/feed.json")

        class _FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return json.dumps({"latest": "2.2.0"}).encode()  # missing url/sha256

        monkeypatch.setattr(
            updater.urllib.request, "urlopen", lambda *a, **k: _FakeResponse()
        )
        assert updater.check_for_update(version_file=vf) is None

    def test_newer_version_returns_update_info(self, tmp_path, monkeypatch):
        vf = _write_version_file(tmp_path, "https://updates.example-real-feed.test/feed.json")

        feed = {
            "latest": "2.2.0",
            "url": "https://updates.example-real-feed.test/Setup-2.2.0.exe",
            "sha256": "abc123",
            "notes": "improvements",
        }

        class _FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return json.dumps(feed).encode()

        monkeypatch.setattr(
            updater.urllib.request, "urlopen", lambda *a, **k: _FakeResponse()
        )
        info = updater.check_for_update(version_file=vf)
        assert info is not None
        assert info.latest == "2.2.0"
        assert info.url == feed["url"]
        assert info.sha256 == "abc123"

    def test_same_or_older_version_returns_none(self, tmp_path, monkeypatch):
        vf = _write_version_file(tmp_path, "https://updates.example-real-feed.test/feed.json", version="2.1.0")

        feed = {
            "latest": "2.1.0",
            "url": "https://updates.example-real-feed.test/Setup-2.1.0.exe",
            "sha256": "abc123",
        }

        class _FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return json.dumps(feed).encode()

        monkeypatch.setattr(
            updater.urllib.request, "urlopen", lambda *a, **k: _FakeResponse()
        )
        assert updater.check_for_update(version_file=vf) is None


# ---------------------------------------------------------------------------
# download_and_verify: sha256 mismatch must raise, never silently proceed
# ---------------------------------------------------------------------------


class TestDownloadAndVerify:
    def test_sha256_mismatch_raises_and_removes_file(self, tmp_path, monkeypatch):
        content = b"downloaded installer bytes"

        class _FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self, *a, **k):
                return content

        def _fake_copyfileobj(src, dst):
            dst.write(content)

        monkeypatch.setattr(
            updater.urllib.request, "urlopen", lambda *a, **k: _FakeResponse()
        )
        monkeypatch.setattr(updater.shutil, "copyfileobj", _fake_copyfileobj)

        info = updater.UpdateInfo(
            latest="2.2.0",
            url="https://updates.example-real-feed.test/Setup-2.2.0.exe",
            sha256="0" * 64,  # deliberately wrong
        )

        with pytest.raises(updater.UpdateError):
            updater.download_and_verify(info, dest_dir=tmp_path)

        assert not (tmp_path / "Setup-2.2.0.exe").exists()

    def test_sha256_match_returns_path(self, tmp_path, monkeypatch):
        content = b"downloaded installer bytes"
        expected_hash = hashlib.sha256(content).hexdigest()

        class _FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self, *a, **k):
                return content

        def _fake_copyfileobj(src, dst):
            dst.write(content)

        monkeypatch.setattr(
            updater.urllib.request, "urlopen", lambda *a, **k: _FakeResponse()
        )
        monkeypatch.setattr(updater.shutil, "copyfileobj", _fake_copyfileobj)

        info = updater.UpdateInfo(
            latest="2.2.0",
            url="https://updates.example-real-feed.test/Setup-2.2.0.exe",
            sha256=expected_hash,
        )

        result_path = updater.download_and_verify(info, dest_dir=tmp_path)
        assert result_path.exists()
        assert result_path.name == "Setup-2.2.0.exe"


class TestApplyUpdate:
    def test_missing_installer_raises(self, tmp_path):
        with pytest.raises(updater.UpdateError):
            updater.apply_update(tmp_path / "does-not-exist.exe")

    def test_launches_with_silent_flags(self, tmp_path, monkeypatch):
        installer = tmp_path / "Setup.exe"
        installer.write_bytes(b"fake exe")

        captured = {}

        class _FakeProc:
            pass

        def _fake_popen(args, **kwargs):
            captured["args"] = args
            return _FakeProc()

        monkeypatch.setattr(updater.subprocess, "Popen", _fake_popen)

        updater.apply_update(installer)

        assert captured["args"][0] == str(installer)
        assert "/VERYSILENT" in captured["args"]
        assert "/SUPPRESSMSGBOXES" in captured["args"]

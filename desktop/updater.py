"""Blackbox BOM auto-updater.

LOCAL-FIRST CONTRACT
---------------------
Blackbox BOM never needs network access to run. This module only ever
*reaches out* to check for updates, and every network failure is caught
and treated as "no update available" -- silently, with no exception
propagating to the caller. The app must keep working offline forever.

Release / feed flow
--------------------
1. Build the new installer (Inno Setup .exe) and compute its SHA-256.
2. Publish the .exe to wherever `feed_url` (see version.json) points a
   *directory listing* of releases at, and publish a `feed.json` file
   (shape: see feed.example.json) at that `feed_url`:

       {
         "latest": "2.1.1",
         "url": "https://.../BlackboxBOM-Setup-2.1.1.exe",
         "sha256": "<hex sha256 of that exe>",
         "notes": "human readable changelog blurb"
       }

3. Bump `desktop/version.json`'s "version" field in the *next* release's
   source tree to the new version once it ships (so the app that was
   just installed correctly reports itself as up to date). `feed_url`
   itself should stay stable across releases -- it always points at the
   *current* latest-version feed document, which you overwrite/republish
   each release.
4. Existing installs periodically call `check_for_update()` (see
   `check_on_launch` below for the non-blocking launch-time hook). If
   `feed.latest` is semver-newer than the locally installed version, the
   app can prompt the user, then call `download_and_verify()` and
   `apply_update()`.
5. The installer is launched with `/VERYSILENT /SUPPRESSMSGBOXES
   /NORESTART` (Inno Setup silent-install flags). The installer's script
   must only ever write to INSTALL_DIR (%ProgramFiles%\\BlackboxBOM) --
   it must NEVER touch DATA_DIR (%ProgramData%\\BlackboxBOM), so
   pgdata\\ and .env survive the update untouched. This module never
   writes to DATA_DIR either.
6. After the silent install finishes and the app is next launched, the
   launcher runs `python -m scripts.init_db`, which detects the existing
   database and runs `alembic upgrade head` to bring the schema forward.
   The updater itself does not touch the database.

Public API
----------
- `semver_compare(a, b) -> int`           pure, unit-testable semver compare
- `is_newer(candidate, current) -> bool`  convenience wrapper
- `check_for_update() -> UpdateInfo | None`   best-effort, silent on failure
- `download_and_verify(info) -> Path`     downloads + verifies sha256 (+ sig)
- `apply_update(path)`                    launches the silent installer
- `check_on_launch(callback)`             non-blocking, notify-only hook
- `update_now()`                          synchronous "Check for updates now"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import shutil
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)

DESKTOP_DIR = Path(__file__).resolve().parent
VERSION_FILE = DESKTOP_DIR / "version.json"

DEFAULT_CHECK_TIMEOUT_SECONDS = 10
DEFAULT_DOWNLOAD_TIMEOUT_SECONDS = 300
_USER_AGENT = "BlackboxBOM-Updater/1.0"


class UpdateError(RuntimeError):
    """Raised for update steps the caller explicitly asked to perform
    (download/verify/apply) that failed. Never raised by the best-effort
    `check_for_update()` -- that function returns None instead."""


@dataclass(frozen=True)
class UpdateInfo:
    latest: str
    url: str
    sha256: str
    notes: str = ""


# ---------------------------------------------------------------------------
# Pure semver compare -- no I/O, fully unit-testable.
# ---------------------------------------------------------------------------

_SEMVER_RE = re.compile(
    r"^\s*v?(?P<major>0|[1-9]\d*)\.(?P<minor>0|[1-9]\d*)\.(?P<patch>0|[1-9]\d*)"
    r"(?:-(?P<prerelease>[0-9A-Za-z\-.]+))?(?:\+[0-9A-Za-z\-.]+)?\s*$"
)


def parse_semver(version: str) -> tuple:
    """Parse a semver-ish string into (major, minor, patch, prerelease_parts).

    Accepts an optional leading "v" and an optional build-metadata suffix
    (+...), which is ignored per the semver spec. Raises ValueError if the
    string isn't parseable.
    """
    match = _SEMVER_RE.match(version or "")
    if not match:
        raise ValueError(f"Invalid semver string: {version!r}")

    major, minor, patch = int(match["major"]), int(match["minor"]), int(match["patch"])
    prerelease = match["prerelease"]
    if prerelease:
        parts = tuple(
            (int(part), "") if part.isdigit() else (float("inf"), part)
            for part in prerelease.split(".")
        )
    else:
        parts = ()
    return (major, minor, patch, parts)


def semver_compare(a: str, b: str) -> int:
    """Compare two semver strings.

    Returns -1 if a < b, 0 if a == b, +1 if a > b.

    Per the semver spec, a version WITH a prerelease tag is considered
    *older* than the same core version WITHOUT one (e.g. "2.1.0-rc.1" is
    older than "2.1.0"). Raises ValueError if either string isn't valid
    semver.
    """
    major_a, minor_a, patch_a, pre_a = parse_semver(a)
    major_b, minor_b, patch_b, pre_b = parse_semver(b)

    core_a = (major_a, minor_a, patch_a)
    core_b = (major_b, minor_b, patch_b)
    if core_a != core_b:
        return -1 if core_a < core_b else 1

    if not pre_a and not pre_b:
        return 0
    if not pre_a:  # a has no prerelease, b does -> a is newer
        return 1
    if not pre_b:
        return -1
    if pre_a == pre_b:
        return 0
    return -1 if pre_a < pre_b else 1


def is_newer(candidate: str, current: str) -> bool:
    """True if `candidate` is a strictly newer semver than `current`.

    Returns False (does not raise) if either string fails to parse, since
    callers use this to gate update prompts and an unparseable version
    should never trigger one.
    """
    try:
        return semver_compare(candidate, current) > 0
    except ValueError:
        logger.warning("Could not compare versions %r / %r as semver", candidate, current)
        return False


# ---------------------------------------------------------------------------
# Local version.json
# ---------------------------------------------------------------------------


def _load_local_version_file(version_file: Path) -> dict:
    return json.loads(version_file.read_text(encoding="utf-8"))


def get_installed_version(version_file: Path = VERSION_FILE) -> str:
    return _load_local_version_file(version_file)["version"]


def get_feed_url(version_file: Path = VERSION_FILE) -> str:
    return _load_local_version_file(version_file)["feed_url"]


def _feed_url_configured(feed_url: Optional[str]) -> bool:
    if not feed_url:
        return False
    return "REPLACE_ME" not in feed_url.upper() and "example.com" not in feed_url.lower()


# ---------------------------------------------------------------------------
# check_for_update -- best-effort, silent-on-failure (local-first)
# ---------------------------------------------------------------------------


def check_for_update(
    version_file: Path = VERSION_FILE,
    timeout: int = DEFAULT_CHECK_TIMEOUT_SECONDS,
) -> Optional[UpdateInfo]:
    """Check the version feed for a newer release.

    Local-first guarantee: this function NEVER raises. Any failure --
    unreadable version.json, unconfigured/placeholder feed_url, DNS
    failure, timeout, HTTP error, malformed feed JSON, missing fields --
    is logged and results in `None`, exactly as if there were simply no
    update available. The app must never fail to start or hang because
    the update feed is unreachable.
    """
    try:
        local = _load_local_version_file(version_file)
        installed = str(local["version"])
        feed_url = local.get("feed_url")
    except Exception:
        logger.debug("Could not read local version file %s", version_file, exc_info=True)
        return None

    if not _feed_url_configured(feed_url):
        logger.debug("Feed URL not configured (%r); skipping update check", feed_url)
        return None

    try:
        request = urllib.request.Request(feed_url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
        feed = json.loads(raw)
        info = UpdateInfo(
            latest=str(feed["latest"]),
            url=str(feed["url"]),
            sha256=str(feed["sha256"]).lower(),
            notes=str(feed.get("notes", "")),
        )
    except Exception as exc:
        # Covers: no network, DNS failure, timeout, HTTP error, bad JSON,
        # missing required keys. All treated identically: no update info.
        logger.info("Update check failed (treated as no-update, local-first): %s", exc)
        return None

    if is_newer(info.latest, installed):
        return info
    return None


# ---------------------------------------------------------------------------
# download_and_verify
# ---------------------------------------------------------------------------


def compute_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_sha256(path: Path, expected_sha256: str) -> bool:
    if not expected_sha256:
        return False
    return compute_sha256(path).lower() == expected_sha256.lower()


def verify_authenticode(path: Path) -> Optional[bool]:
    """Best-effort Authenticode signature check via PowerShell's
    Get-AuthenticodeSignature.

    Returns True (valid signature), False (present but invalid/untrusted),
    or None if the check itself could not be performed (e.g. PowerShell
    unavailable -- this is not a Windows box, or running in a stripped-down
    CI container). A None result means "could not verify", not "invalid";
    callers decide whether that's acceptable via `require_signature`.
    """
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                f"(Get-AuthenticodeSignature -LiteralPath '{path}').Status",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        status = (result.stdout or "").strip()
        if not status:
            return None
        return status == "Valid"
    except Exception:
        logger.debug("Authenticode verification unavailable", exc_info=True)
        return None


def download_and_verify(
    info: UpdateInfo,
    dest_dir: Optional[Path] = None,
    require_signature: bool = False,
    timeout: int = DEFAULT_DOWNLOAD_TIMEOUT_SECONDS,
) -> Path:
    """Download the installer described by `info` into a temp dir, then
    verify its SHA-256 against the feed's claimed hash (and optionally its
    Authenticode signature).

    Raises `UpdateError` if the download or verification fails. Never
    touches DATA_DIR; only ever writes to a fresh temp directory.
    """
    tmp_dir = Path(dest_dir) if dest_dir is not None else Path(tempfile.mkdtemp(prefix="bbbom-update-"))
    tmp_dir.mkdir(parents=True, exist_ok=True)

    filename = info.url.rsplit("/", 1)[-1] or f"BlackboxBOM-Setup-{info.latest}.exe"
    dest_path = tmp_dir / filename

    try:
        request = urllib.request.Request(info.url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(request, timeout=timeout) as response, open(dest_path, "wb") as out:
            shutil.copyfileobj(response, out)
    except (urllib.error.URLError, OSError) as exc:
        raise UpdateError(f"Failed to download update from {info.url}: {exc}") from exc

    if not verify_sha256(dest_path, info.sha256):
        dest_path.unlink(missing_ok=True)
        raise UpdateError(
            f"SHA-256 mismatch for downloaded installer (expected {info.sha256})"
        )

    if require_signature:
        sig_ok = verify_authenticode(dest_path)
        if sig_ok is False:
            dest_path.unlink(missing_ok=True)
            raise UpdateError("Authenticode signature verification failed for downloaded installer")
        if sig_ok is None:
            logger.warning(
                "Authenticode signature could not be verified (no PowerShell/signing "
                "tooling available); proceeding on SHA-256 match alone"
            )

    return dest_path


# ---------------------------------------------------------------------------
# apply_update
# ---------------------------------------------------------------------------


def apply_update(installer_path: Path, extra_args: Optional[list] = None) -> subprocess.Popen:
    """Launch the downloaded installer in silent mode.

    Uses Inno Setup's silent-install switches (/VERYSILENT
    /SUPPRESSMSGBOXES /NORESTART). The installer script is only ever
    expected to write to INSTALL_DIR (%ProgramFiles%\\BlackboxBOM); this
    function does not and must never touch DATA_DIR
    (%ProgramData%\\BlackboxBOM) -- pgdata\\ and .env are preserved because
    the installer itself is built to leave them alone, not because of
    anything special done here.

    The process is launched detached so this Python process (and the app
    it belongs to) can exit cleanly and let the installer replace files
    that are currently in use.
    """
    installer_path = Path(installer_path)
    if not installer_path.exists():
        raise UpdateError(f"Installer not found: {installer_path}")

    args = [str(installer_path), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"]
    if extra_args:
        args.extend(extra_args)

    logger.info("Launching update installer: %s", args)

    creationflags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
        subprocess, "CREATE_NEW_PROCESS_GROUP", 0
    )
    return subprocess.Popen(args, creationflags=creationflags, close_fds=True)


# ---------------------------------------------------------------------------
# Launch-time hook: non-blocking, notify-only
# ---------------------------------------------------------------------------


def check_on_launch(
    callback: Callable[[Optional[UpdateInfo]], None],
    version_file: Path = VERSION_FILE,
    timeout: int = DEFAULT_CHECK_TIMEOUT_SECONDS,
) -> threading.Thread:
    """Kick off a background, non-blocking update check at app launch.

    Starts a daemon thread that calls `check_for_update()` and then invokes
    `callback(info)` with the result (`UpdateInfo` or `None`) once done.
    This function itself returns immediately -- it never blocks startup --
    and no exception from the check or the callback can escape the thread
    (both are caught and logged), so a broken update feed can never crash
    or hang the app. This hook only *notifies*; it does not download or
    apply anything.
    """

    def _worker() -> None:
        try:
            info = check_for_update(version_file=version_file, timeout=timeout)
        except Exception:
            logger.debug("Background update check errored unexpectedly", exc_info=True)
            info = None
        try:
            callback(info)
        except Exception:
            logger.debug("Update-check callback raised", exc_info=True)

    thread = threading.Thread(target=_worker, name="bbbom-update-check", daemon=True)
    thread.start()
    return thread


# ---------------------------------------------------------------------------
# Manual "Update now" entrypoint
# ---------------------------------------------------------------------------


def update_now(
    version_file: Path = VERSION_FILE,
    require_signature: bool = False,
    auto_launch: bool = True,
) -> Optional[Path]:
    """Synchronous, user-initiated "Check for updates now" flow.

    Checks the feed, and if a newer version is available, downloads and
    verifies the installer, then (if `auto_launch`) launches it silently.

    Returns the verified installer path if an update was applied/staged,
    or None if already up to date (or the check failed -- best-effort,
    local-first, so "no update" and "couldn't check" look the same to
    callers that only care whether an update was applied).
    """
    info = check_for_update(version_file=version_file)
    if info is None:
        print("No update available (or update check could not be completed).")
        return None

    print(f"Update available: {info.latest}")
    if info.notes:
        print(f"  {info.notes}")
    print("Downloading and verifying update...")
    installer_path = download_and_verify(info, require_signature=require_signature)
    print(f"Verified installer: {installer_path}")

    if auto_launch:
        print("Launching silent installer. The app will restart shortly...")
        apply_update(installer_path)

    return installer_path


def _main() -> None:
    parser = argparse.ArgumentParser(description="Blackbox BOM auto-updater")
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only check the feed; do not download or apply anything",
    )
    parser.add_argument(
        "--require-signature",
        action="store_true",
        help="Fail if the downloaded installer's Authenticode signature cannot be verified",
    )
    parser.add_argument(
        "--no-launch",
        action="store_true",
        help="Download and verify only; do not launch the installer",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    if args.check_only:
        info = check_for_update()
        print(f"Update available: {info.latest}" if info else "No update available.")
        return

    update_now(require_signature=args.require_signature, auto_launch=not args.no_launch)


if __name__ == "__main__":
    _main()

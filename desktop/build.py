#!/usr/bin/env python3
"""One-command release build for Blackbox BOM desktop.

Pipeline (fail-fast, each stage checks its own prerequisites first):

    1. frontend build         -> desktop/build_frontend.ps1  (npm run build in ../frontend)
    2. backend bundle         -> PyInstaller backend.spec    (onedir, app.main:app + uvicorn)
    3. launcher bundle        -> PyInstaller launcher.spec   (onefile, launcher.exe)
    4. portable Postgres      -> desktop/fetch_postgres.ps1  (populates build/pgsql)
    5. assemble INSTALL_DIR layout under desktop/build/
    6. compile installer      -> iscc desktop/installer.iss
    7. optional Authenticode sign of the installer (CODE_SIGN_PFX / CODE_SIGN_PW)
    8. emit desktop/dist/BlackboxBOM-Setup-<version>.exe + matching feed.json

Usage:
    python build.py                # full pipeline
    python build.py --skip-sign    # skip Authenticode signing even if a cert is configured
    python build.py --version 2.1.1 --feed-url https://example.com/feed.json

Reads the version from desktop/version.json unless --version is given. This
script only builds and assembles; it does not touch git and does not publish
anything to the network (see DESKTOP_PACKAGING.md for the release/publish
steps that follow a successful build).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

DESKTOP_DIR = Path(__file__).resolve().parent
REPO_ROOT = DESKTOP_DIR.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
BACKEND_DIR = REPO_ROOT / "backend"
BUILD_DIR = DESKTOP_DIR / "build"
DIST_DIR = DESKTOP_DIR / "dist"

INSTALL_STAGE = BUILD_DIR / "install"  # mirrors the final INSTALL_DIR layout


class BuildError(RuntimeError):
    """Raised for any fail-fast stop; message is printed and exit code is 1."""


def _log(stage: str, msg: str) -> None:
    print(f"[build:{stage}] {msg}")


def _run(cmd: list[str], *, cwd: Path | None = None, stage: str = "run") -> None:
    _log(stage, "$ " + " ".join(str(c) for c in cmd))
    try:
        subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)
    except FileNotFoundError as exc:
        raise BuildError(
            f"[{stage}] required tool not found: {cmd[0]!r}. "
            f"See DESKTOP_PACKAGING.md prerequisites."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise BuildError(f"[{stage}] command failed with exit code {exc.returncode}: {' '.join(str(c) for c in cmd)}") from exc


def _require_tool(name: str, hint: str) -> str:
    path = shutil.which(name)
    if not path:
        raise BuildError(f"required tool '{name}' not found on PATH. {hint}")
    return path


def _require_file(path: Path, hint: str) -> Path:
    if not path.exists():
        raise BuildError(f"required file missing: {path}\n  {hint}")
    return path


def load_version(explicit: str | None) -> tuple[str, str]:
    """Return (version, feed_url) from desktop/version.json, allowing override."""
    version_json = DESKTOP_DIR / "version.json"
    data: dict = {}
    if version_json.exists():
        try:
            data = json.loads(version_json.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise BuildError(f"desktop/version.json is not valid JSON: {exc}") from exc
    version = explicit or data.get("version")
    feed_url = data.get("feed_url", "")
    if not version:
        raise BuildError(
            "no version available: pass --version or create desktop/version.json "
            'with {"version": "X.Y.Z", "feed_url": "..."}'
        )
    return version, feed_url


# ---------------------------------------------------------------------------
# Stage 1: frontend
# ---------------------------------------------------------------------------

def stage_frontend(skip: bool) -> Path:
    stage = "frontend"
    dist = FRONTEND_DIR / "dist"
    if skip:
        _log(stage, "skipped (--skip-frontend); using existing frontend/dist")
        return _require_file(dist / "index.html", "run without --skip-frontend at least once")

    script = _require_file(
        DESKTOP_DIR / "build_frontend.ps1",
        "expected desktop/build_frontend.ps1 (npm ci && npm run build in frontend/)",
    )
    _require_tool("pwsh", "install PowerShell 7 (pwsh) or use build.ps1 instead") if shutil.which("pwsh") else _require_tool(
        "powershell", "PowerShell is required to run build_frontend.ps1"
    )
    ps_exe = "pwsh" if shutil.which("pwsh") else "powershell"
    _run(
        [ps_exe, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        cwd=DESKTOP_DIR,
        stage=stage,
    )
    _require_file(dist / "index.html", "build_frontend.ps1 ran but frontend/dist/index.html was not produced")
    _log(stage, f"OK -> {dist}")
    return dist


# ---------------------------------------------------------------------------
# Stage 2/3: PyInstaller bundles
# ---------------------------------------------------------------------------

def _pyinstaller_bin() -> list[str]:
    exe = shutil.which("pyinstaller")
    if exe:
        return [exe]
    # Fall back to `python -m PyInstaller` so a venv without a console-script
    # shim still works.
    probe = subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--version"],
        capture_output=True,
        text=True,
    )
    if probe.returncode == 0:
        return [sys.executable, "-m", "PyInstaller"]
    raise BuildError(
        "PyInstaller not found. Install it with: pip install pyinstaller "
        "(see DESKTOP_PACKAGING.md prerequisites)."
    )


def stage_pyinstaller(spec_name: str, stage: str) -> Path:
    spec = _require_file(DESKTOP_DIR / spec_name, f"expected desktop/{spec_name}")
    pyinstaller = _pyinstaller_bin()
    workpath = BUILD_DIR / "pyinstaller" / "work" / stage
    distpath = BUILD_DIR / "pyinstaller" / "dist" / stage
    workpath.mkdir(parents=True, exist_ok=True)
    distpath.mkdir(parents=True, exist_ok=True)
    _run(
        pyinstaller
        + [
            str(spec),
            "--noconfirm",
            "--workpath",
            str(workpath),
            "--distpath",
            str(distpath),
        ],
        cwd=DESKTOP_DIR,
        stage=stage,
    )
    _log(stage, f"OK -> {distpath}")
    return distpath


# ---------------------------------------------------------------------------
# Stage 4: portable Postgres
# ---------------------------------------------------------------------------

def stage_postgres(skip: bool) -> Path:
    stage = "postgres"
    pgsql_dir = BUILD_DIR / "pgsql"
    if skip and (pgsql_dir / "bin" / "postgres.exe").exists():
        _log(stage, "skipped (--skip-postgres); reusing cached build/pgsql")
        return pgsql_dir

    script = _require_file(
        DESKTOP_DIR / "fetch_postgres.ps1",
        "expected desktop/fetch_postgres.ps1 (downloads/extracts portable PostgreSQL into build/pgsql)",
    )
    ps_exe = "pwsh" if shutil.which("pwsh") else "powershell"
    if not shutil.which(ps_exe):
        raise BuildError("PowerShell is required to run fetch_postgres.ps1")
    _run(
        [ps_exe, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script), "-Destination", str(pgsql_dir)],
        cwd=DESKTOP_DIR,
        stage=stage,
    )
    _require_file(pgsql_dir / "bin" / "postgres.exe", "fetch_postgres.ps1 ran but pgsql/bin/postgres.exe is missing")
    _log(stage, f"OK -> {pgsql_dir}")
    return pgsql_dir


# ---------------------------------------------------------------------------
# Stage 5: assemble INSTALL_DIR layout
# ---------------------------------------------------------------------------

def stage_assemble(frontend_dist: Path, backend_dist: Path, launcher_dist: Path, pgsql_dir: Path) -> Path:
    stage = "assemble"
    if INSTALL_STAGE.exists():
        shutil.rmtree(INSTALL_STAGE)
    INSTALL_STAGE.mkdir(parents=True, exist_ok=True)

    # launcher.exe at the INSTALL_DIR root
    launcher_exe = launcher_dist / "launcher.exe"
    _require_file(launcher_exe, "launcher.spec did not produce launcher.exe")
    shutil.copy2(launcher_exe, INSTALL_STAGE / "launcher.exe")

    # backend\ (onedir PyInstaller bundle: backend.exe + _internal\ etc.)
    backend_out = INSTALL_STAGE / "backend"
    shutil.copytree(backend_dist, backend_out)

    # frontend\dist
    frontend_out = INSTALL_STAGE / "frontend" / "dist"
    frontend_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(frontend_dist, frontend_out)

    # pgsql\ (portable Postgres binaries only -- no data)
    pgsql_out = INSTALL_STAGE / "pgsql"
    shutil.copytree(pgsql_dir, pgsql_out)

    # ship the durability template so the launcher can seed a fresh pgdata\postgresql.conf
    conf_template = DESKTOP_DIR / "postgresql.conf.template"
    if conf_template.exists():
        shutil.copy2(conf_template, INSTALL_STAGE / "postgresql.conf.template")

    _log(stage, f"OK -> {INSTALL_STAGE}")
    return INSTALL_STAGE


# ---------------------------------------------------------------------------
# Stage 6: Inno Setup installer
# ---------------------------------------------------------------------------

def stage_installer(version: str) -> Path:
    stage = "installer"
    iscc = shutil.which("iscc") or shutil.which("ISCC")
    if not iscc:
        # Common default install location for Inno Setup 6.
        default = Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe")
        if default.exists():
            iscc = str(default)
    if not iscc:
        raise BuildError(
            "Inno Setup compiler (iscc/ISCC.exe) not found on PATH. "
            "Install Inno Setup 6 (https://jrsoftware.org/isinfo.php) or add it to PATH."
        )

    iss = _require_file(DESKTOP_DIR / "installer.iss", "expected desktop/installer.iss")
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    _run(
        [
            iscc,
            f"/DAppVersion={version}",
            f"/DSourceDir={INSTALL_STAGE}",
            f"/DOutputDir={DIST_DIR}",
            str(iss),
        ],
        cwd=DESKTOP_DIR,
        stage=stage,
    )
    exe = DIST_DIR / f"BlackboxBOM-Setup-{version}.exe"
    _require_file(exe, f"installer.iss compiled but did not produce {exe.name} in dist/ (check its OutputBaseFilename)")
    _log(stage, f"OK -> {exe}")
    return exe


# ---------------------------------------------------------------------------
# Stage 7: optional code signing
# ---------------------------------------------------------------------------

def stage_sign(installer_exe: Path, skip: bool) -> None:
    stage = "sign"
    pfx = os.environ.get("CODE_SIGN_PFX")
    pw = os.environ.get("CODE_SIGN_PW")
    if skip:
        _log(stage, "skipped (--skip-sign)")
        return
    if not pfx:
        _log(stage, "CODE_SIGN_PFX not set -- skipping signing (installer will be unsigned)")
        return
    if not Path(pfx).exists():
        raise BuildError(f"CODE_SIGN_PFX points to a file that does not exist: {pfx}")
    signtool = shutil.which("signtool")
    if not signtool:
        raise BuildError(
            "CODE_SIGN_PFX is set but 'signtool' was not found on PATH. "
            "Install the Windows SDK or run from a 'Developer PowerShell for VS' prompt."
        )
    cmd = [
        signtool, "sign",
        "/f", pfx,
        "/fd", "SHA256",
        "/tr", "http://timestamp.digicert.com",
        "/td", "SHA256",
    ]
    if pw:
        cmd += ["/p", pw]
    cmd.append(str(installer_exe))
    _run(cmd, stage=stage)
    _log(stage, f"OK -> signed {installer_exe.name}")


# ---------------------------------------------------------------------------
# Stage 8: feed.json + checksum
# ---------------------------------------------------------------------------

def stage_feed(installer_exe: Path, version: str, feed_url: str, notes: str) -> Path:
    stage = "feed"
    sha256 = hashlib.sha256(installer_exe.read_bytes()).hexdigest()
    feed = {
        "latest": version,
        "url": feed_url or f"https://REPLACE-ME/releases/{installer_exe.name}",
        "sha256": sha256,
        "notes": notes or f"Blackbox BOM {version}",
    }
    feed_path = DIST_DIR / "feed.json"
    feed_path.write_text(json.dumps(feed, indent=2) + "\n", encoding="utf-8")
    _log(stage, f"OK -> {feed_path} (sha256={sha256[:12]}...)")
    return feed_path


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--version", help="Override version instead of reading desktop/version.json")
    parser.add_argument("--feed-url", default=None, help="Override feed_url written into dist/feed.json")
    parser.add_argument("--notes", default="", help="Release notes to embed in feed.json")
    parser.add_argument("--skip-frontend", action="store_true", help="Reuse existing frontend/dist instead of rebuilding")
    parser.add_argument("--skip-postgres", action="store_true", help="Reuse cached desktop/build/pgsql instead of re-fetching")
    parser.add_argument("--skip-sign", action="store_true", help="Skip Authenticode signing even if CODE_SIGN_PFX is set")
    parser.add_argument("--skip-installer", action="store_true", help="Stop after assembling INSTALL_DIR layout (skip iscc/sign/feed)")
    args = parser.parse_args(argv)

    version, default_feed_url = load_version(args.version)
    feed_url = args.feed_url if args.feed_url is not None else default_feed_url

    print(f"=== Blackbox BOM desktop build: v{version} ===")
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    try:
        frontend_dist = stage_frontend(args.skip_frontend)
        backend_dist_root = stage_pyinstaller("backend.spec", "backend")
        launcher_dist_root = stage_pyinstaller("launcher.spec", "launcher")
        pgsql_dir = stage_postgres(args.skip_postgres)

        # PyInstaller onedir output lands in <distpath>/<name>/; discover it
        # rather than hardcoding the spec's internal app name.
        backend_dist = _first_subdir(backend_dist_root, "backend.spec")
        launcher_dist = _first_subdir(launcher_dist_root, "launcher.spec")

        stage_assemble(frontend_dist, backend_dist, launcher_dist, pgsql_dir)

        if args.skip_installer:
            print(f"\nDone (assembly only). INSTALL_DIR layout staged at: {INSTALL_STAGE}")
            return 0

        installer_exe = stage_installer(version)
        stage_sign(installer_exe, args.skip_sign)
        stage_feed(installer_exe, version, feed_url, args.notes)
    except BuildError as exc:
        print(f"\nBUILD FAILED: {exc}", file=sys.stderr)
        return 1

    print(f"\nDone. Installer: {DIST_DIR / f'BlackboxBOM-Setup-{version}.exe'}")
    print(f"Feed:      {DIST_DIR / 'feed.json'}")
    return 0


def _first_subdir(distpath: Path, spec_hint: str) -> Path:
    entries = [p for p in distpath.iterdir() if p.is_dir()]
    if len(entries) == 1:
        return entries[0]
    # If onefile mode was used there's no subdir -- the distpath itself holds
    # the exe(s).
    if any(p.suffix == ".exe" for p in distpath.iterdir() if p.is_file()):
        return distpath
    raise BuildError(
        f"could not locate PyInstaller output under {distpath} (from {spec_hint}); "
        "expected exactly one app subdirectory (onedir) or exe files directly (onefile)"
    )


if __name__ == "__main__":
    sys.exit(main())

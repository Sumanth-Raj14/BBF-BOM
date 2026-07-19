# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: Blackbox BOM backend desktop bundle.

Builds a one-directory bundle (dist/backend/) containing an executable that
runs the FastAPI app (app.main:app) via uvicorn -- see backend_entry.py.
The launcher copies/installs this directory's contents into
%ProgramFiles%\\BlackboxBOM (INSTALL_DIR) as part of the app install.

Build:
    cd desktop
    pyinstaller backend.spec

One-directory (not one-file) is used deliberately: startup is faster (no
self-extraction on every launch) and it plays nicer with native deps
(asyncpg, cryptography, Pillow, etc.).
"""
import os

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

# SPECPATH is injected by PyInstaller into the exec globals of this file.
DESKTOP_DIR = os.path.abspath(SPECPATH)  # noqa: F821
REPO_ROOT = os.path.abspath(os.path.join(DESKTOP_DIR, ".."))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")

# --- hidden imports -----------------------------------------------------
# app.main and its sibling modules do a mix of module-level and
# function-local ("lazy") imports (e.g. scripts.startup_health_check,
# app.integrations.worker, app.core.backup). PyInstaller's static analysis
# generally follows these, but we collect whole packages defensively so a
# lazily-imported submodule is never silently dropped from the bundle.
_PACKAGES_TO_COLLECT = (
    "app",
    "scripts",
    "uvicorn",
    "sqlalchemy",
    "asyncpg",
    "alembic",
    "pydantic",
    "pydantic_core",
    "jwt",  # PyJWT
    "cryptography",
    "bcrypt",
    "slowapi",
    "redis",
    "sentry_sdk",
    "aiobotocore",
    "botocore",
    "openpyxl",
    "reportlab",
    "PIL",
    "qrcode",
    "barcode",
    "bs4",
    "multipart",
    "dotenv",
    "pyotp",
    "psutil",
    "magic",
)

hiddenimports = []
for _pkg in _PACKAGES_TO_COLLECT:
    try:
        hiddenimports += collect_submodules(_pkg)
    except Exception:
        # Package not installed in the build env / no submodules to collect;
        # non-fatal, the top-level import (if actually used) still works.
        pass

# uvicorn resolves its loop/protocol implementations by string name at
# runtime, which static analysis can miss -- list them explicitly.
_EXTRA_HIDDEN_IMPORTS = (
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
)
for _extra in _EXTRA_HIDDEN_IMPORTS:
    if _extra not in hiddenimports:
        hiddenimports.append(_extra)

# --- data files ----------------------------------------------------------
# - alembic.ini + the full alembic/ tree (env.py, script.py.mako, versions/)
#   so scripts.init_db (bundled alongside app.main, run by the launcher) can
#   run `alembic upgrade head` / `alembic stamp head` against the bundled
#   Postgres cluster.
# - app/data/reference/*.json: local-first RoHS/REACH/SVHC reference
#   snapshots read by app.services.reference_seed at migration/seed time.
datas = [
    (os.path.join(BACKEND_DIR, "alembic.ini"), "."),
    (os.path.join(BACKEND_DIR, "alembic"), "alembic"),
    (
        os.path.join(BACKEND_DIR, "app", "data", "reference"),
        os.path.join("app", "data", "reference"),
    ),
]

a = Analysis(  # noqa: F821
    [os.path.join(DESKTOP_DIR, "backend_entry.py")],
    pathex=[BACKEND_DIR, DESKTOP_DIR],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Headless server bundle: exclude GUI toolkits that get pulled into the
    # build env transitively. PyInstaller refuses to bundle two Qt bindings
    # (PyQt6 + PySide6 both present here), and none are needed by the backend.
    excludes=["PyQt5", "PyQt6", "PySide2", "PySide6", "tkinter", "matplotlib", "IPython"],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)  # noqa: F821

exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(  # noqa: F821
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="backend",
)

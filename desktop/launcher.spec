# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Blackbox BOM single-click launcher.

Produces one windowed executable, launcher.exe, in --onefile mode so that
desktop/build.py's dist-discovery (_first_subdir) finds it directly under
the launcher dist path with no app subdirectory. build.py copies it to the
root of INSTALL_DIR.

Build directly:
    cd desktop
    pyinstaller launcher.spec --noconfirm

Or via the full packaging pipeline: python build.py (see build.py docstring).

Icon placeholder
-----------------
Looks for desktop/icon.ico next to this spec. That file does not ship in the
repo yet -- drop the real Blackbox BOM icon there when branding assets are
ready. Until then the build proceeds without a custom icon (PyInstaller's
default) instead of failing, so this spec is buildable as-is today.

Optional tray dependencies
---------------------------
launcher.py tries `import pystray` / `from PIL import Image, ImageDraw` for
a system tray icon and gracefully falls back to a console loop if they are
not installed. They are listed in hiddenimports below so that, when they ARE
installed in the build environment, PyInstaller's static analysis (which
cannot see imports made inside a try/except) still bundles them into the
final exe. If they are not installed, PyInstaller only warns -- the build
still succeeds and the shipped exe simply falls back to the console loop.
"""
from pathlib import Path

block_cipher = None

DESKTOP_DIR = Path(SPECPATH)
ICON_PATH = DESKTOP_DIR / "icon.ico"

a = Analysis(
    ['launcher.py'],
    pathex=[str(DESKTOP_DIR)],
    binaries=[],
    datas=[],
    hiddenimports=[
        'pystray',
        'PIL.Image',
        'PIL.ImageDraw',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='launcher',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ICON_PATH) if ICON_PATH.exists() else None,
)

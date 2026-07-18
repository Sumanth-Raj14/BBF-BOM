"""Desktop bundle entry point for the Blackbox BOM backend.

This is the PyInstaller entry script (see ``desktop/backend.spec``). It is
run by the Windows launcher after Postgres is up and ``scripts.init_db`` has
bootstrapped the schema. It starts uvicorn serving the FastAPI app defined in
``app.main`` on the fixed local port from the shared contract
(127.0.0.1:8756), reading host/port/log-level overrides from the environment
so the launcher stays in control of configuration.

Note: we import the FastAPI ``app`` object directly (rather than passing the
"app.main:app" import-string to uvicorn.run) so PyInstaller's static analysis
can walk the whole import graph from this single entry point at build time.
Since we never use uvicorn's --reload (not applicable/desired for a bundled
desktop app), passing the app object directly is equivalent and safer to
freeze.
"""
import os
import sys

# Ensure the bundled backend package root is importable both when frozen
# (PyInstaller sets sys._MEIPASS) and when run unfrozen for local testing.
if getattr(sys, "frozen", False):
    _BUNDLE_DIR = sys._MEIPASS  # type: ignore[attr-defined]
else:
    _BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
if _BUNDLE_DIR not in sys.path:
    sys.path.insert(0, _BUNDLE_DIR)

import uvicorn  # noqa: E402

from app.main import app as fastapi_app  # noqa: E402


def main() -> None:
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("BACKEND_PORT", "8756"))
    log_level = os.environ.get("BACKEND_LOG_LEVEL", "info")

    uvicorn.run(
        fastapi_app,
        host=host,
        port=port,
        log_level=log_level,
        workers=1,
        reload=False,
    )


if __name__ == "__main__":
    main()

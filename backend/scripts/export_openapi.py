"""Write the FastAPI OpenAPI schema to a file the frontend can check against.

Improvement #3. The frontend hand-writes every request path in `api.js`, so a
path or parameter that does not exist on the backend is only discovered at
runtime — audit finding A8 was exactly that: `erpConnectorsAPI.logs("latest")`
sent a string into an `int` path parameter, guaranteeing a 422 that the UI
swallowed.

Exporting the spec makes the contract checkable. The frontend test
`api-contract.test.js` reads this file and fails if `api.js` references a path
the backend does not serve.

Regenerate after adding or renaming routes:

    cd backend && python -m scripts.export_openapi

The output is committed deliberately: the frontend test must run without a
Python environment or a live server (CI runs the two suites in separate jobs).
A stale file is caught by the drift test in the backend suite, which
regenerates the spec in memory and compares.
"""

import json
import pathlib

OUTPUT = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"


def build() -> dict:
    from app.main import app

    return app.openapi()


def main() -> None:
    spec = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    # sort_keys so regeneration produces a stable diff rather than churn.
    OUTPUT.write_text(
        json.dumps(spec, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    paths = spec.get("paths", {})
    ops = sum(
        1
        for methods in paths.values()
        for m in methods
        if m in ("get", "post", "put", "patch", "delete")
    )
    print(f"Wrote {OUTPUT} — {len(paths)} paths, {ops} operations.")


if __name__ == "__main__":
    main()

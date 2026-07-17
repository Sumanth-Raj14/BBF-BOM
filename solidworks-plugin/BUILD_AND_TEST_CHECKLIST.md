# SolidWorks Add-in — Build, Install & Round-Trip Test Checklist

The add-in code is complete and the backend it talks to is verified (see
`backend/app/tests/test_solidworks_bom_ingest.py`). The steps below must run on a
**Windows machine with SolidWorks installed** — the plugin uses SolidWorks COM
interop, so it cannot be built or tested without it.

## What changed in this pass (WS1)
- `ApiClient.cs` now calls the **working** endpoints (`/api/v1/solidworks/*`, `/solidworks/license/*`) instead of the dead `/api/v1/cad/*`.
- `Models.cs` / `BomExtractor.cs` now capture assembly **hierarchy** (`Level`, `IsAssembly`) so the pushed BOM ingests as a real multi-level BOM.
- Fixed a compile-breaking line in `BomExtractor.cs` (`sketch-plane` → `"Unknown"`).
- Backend now authenticates the plugin via `POST /api/v1/auth/plugin-login` (API key → token) and builds `BomTemplate` + `bom_items` tree on `POST /api/v1/solidworks/sync`.

## Prerequisites
- [ ] Windows + **SolidWorks** installed (registers the `SldWorks` type library the project COM-references — GUID `{83A33D51-C5AC-11CE-9295-000021473128}`).
- [ ] **.NET Framework 4.8** Developer Pack (target is `net48`).
- [ ] Visual Studio 2019+ **or** Build Tools (MSBuild).
- [ ] NuGet — restores `Newtonsoft.Json 13.0.3` (expected at `solidworks-plugin/packages/`).
- [ ] Inno Setup 6 (only if building the installer).

## Build
1. [ ] Restore NuGet: `nuget restore` in `solidworks-plugin/` (or let VS restore).
2. [ ] Build Release:
   ```
   msbuild BlackboxBOM.SolidWorks\BlackboxBOM.SolidWorks.csproj /p:Configuration=Release
   ```
   Output: `bin\Release\BlackboxBOM.SolidWorks.dll` (built with `RegisterForComInterop=true`).
3. [ ] If MSBuild can't resolve the `SldWorks` COM reference, confirm SolidWorks is installed and open VS **as Administrator** once so the interop wrapper is generated.

## Register the add-in
- [ ] Building in an **elevated** VS auto-registers COM interop; otherwise run
  `regasm /codebase bin\Release\BlackboxBOM.SolidWorks.dll`.
- [ ] Ensure the SolidWorks add-in registry entry exists (the installer `.iss` writes it; `BlackboxBomAddin` also self-registers via its COM attributes). Restart SolidWorks; enable the add-in under Tools → Add-Ins.

## Configure the connection
1. [ ] In the web app: log in → **API Keys** screen → **create key** → copy the `bkb_…` value (shown once).
       ⚠️ Create the key against the **PostgreSQL** deployment — the key-create SQL uses a Postgres-only `::json` cast, so it won't run on a SQLite/dev DB.
2. [ ] In SolidWorks: open the **Blackbox BOM** task pane → **Settings** → set:
       - API URL: `http://<host>:8000` (e.g. `http://localhost:8000`)
       - API Key: the `bkb_…` value
       The plugin authenticates via `POST /api/v1/auth/plugin-login` and stores the returned token.

## Round-trip test (the real "working" proof)
1. [ ] Open a multi-level assembly (`.SLDASM`) with at least one sub-assembly.
2. [ ] Task pane → **Extract BOM** → **Push to Blackbox**.
3. [ ] Verify in the app (any one is sufficient):
       - `GET /api/v1/solidworks/` → the assembly is listed.
       - `GET /api/v1/solidworks/bom-structure?source_file=<AssemblyName.SLDASM>` → nested tree with parent/child + quantities + a `levels` count > 1.
       - Parts screen shows the created parts; BOM editor shows the imported multi-level BOM.
4. [ ] Change a quantity in CAD, re-push → confirm the BOM **rebuilds** (no duplicate rows) — the sync is idempotent per source file.

## Known gaps to decide on
- [ ] **Licensing**: `/api/v1/solidworks/license/{verify,activate}` return `501 Not Implemented`. Either implement licensing or make the plugin skip the license gate for internal use.
- [ ] **Health check**: `ApiClient.IsApiAvailable()` calls `/api/v1/health` — confirm that exact path exists on your deployment (non-blocking; push works regardless).
- [ ] **Sign for distribution** (recommended): Authenticode-sign `BlackboxBOM.SolidWorks.dll` and the Inno Setup output with `signtool` to avoid SmartScreen/add-in trust warnings.

## Package (optional)
- [ ] Build `Installer\BlackboxBOM_SolidWorks.iss` with Inno Setup → `setup.exe` that installs + registers the add-in and its dependencies.

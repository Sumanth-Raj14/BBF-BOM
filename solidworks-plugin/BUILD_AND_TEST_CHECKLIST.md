# SolidWorks Add-in — Build, Install & Round-Trip Test Checklist

The steps below must run on a **Windows machine with SolidWorks installed** — the
plugin uses SolidWorks COM interop, so it cannot be built or tested without it.

## What changed in this pass (WS2 — build-prep)

This pass was done in an environment with **no SolidWorks install and no MSBuild**,
so nothing here was compiled against the real Interop assemblies — everything below
was fixed by careful reading against the SolidWorks API's documented shapes and by
diffing against the actual backend endpoints (`backend/app/api/endpoints/solidworks_integration.py`,
`backend/app/api/endpoints/auth.py`). `dotnet build` **was** run: NuGet restore
succeeds and the project loads; the build then stops at the new
`CheckSolidWorksInterop` guard (see below) because this machine has no SolidWorks
install — that is the expected/only failure here. **Please build for real on your
SolidWorks machine and report anything the guard didn't catch.**

Fixes made (roughly most → least impactful):

- **Hard compile blockers** (the project could not have built before this pass):
  - `BlackboxBomAddin.cs` applied `[SwAddin(...)]` but the attribute class was never
    defined anywhere → added `SwAddinAttribute.cs`.
  - `BomExtractor.cs` called `ExtractFromPart(...)` for part (non-assembly) documents,
    but that method didn't exist → implemented it.
  - `BomExtractor.cs` had a literal syntax error: `sketch-plane?.Name` (reads as
    `sketch` minus an undefined `plane`) → replaced with the `"Unknown"` literal the
    previous pass's changelog claimed to have already done (it hadn't).
  - `ModelUpdater.ApplyChangesToMultipleModels` passed `ref errors, ref warnings` to
    `OpenDoc6` without ever declaring `errors`/`warnings` → declared them.
  - `ApiClient.cs` used LINQ (`.Select()`) without `using System.Linq;` → added it.
  - The `.csproj` declared only **one** SolidWorks COM reference (`SldWorks`), but
    the code uses three interop namespaces (`SolidWorks.Interop.sldworks`,
    `.swconst`, `.swpublished`) → see "Interop references" below.

- **Multi-level BOM correctness** (the stated point of this plugin):
  - `BomExtractor.ExtractFromAssembly` called `IAssemblyDoc.GetComponents2(false)`
    (which already returns **every** component in the assembly, flattened,
    including everything nested in sub-assemblies) and then recursed into each
    sub-assembly calling `GetComponents2(false)` **again** — this would have
    duplicated every descendant component once per level of nesting. Fixed to call
    `GetComponents2(true)` (direct children only) at each level and recurse
    manually, threading a `level` counter through.
  - `BomItem.Level` / `BomItem.IsAssembly` existed on the model but were **never
    actually set** anywhere — the previous pass's changelog claimed hierarchy
    capture was done; the fields were added but never populated. Now set on every
    item during the fixed traversal above.

- **Request shape vs. the real backend** (read `solidworks_integration.py` +
  `auth.py` read-only to confirm):
  - `ApiClient.SyncBom()` (→ `POST /api/v1/solidworks/apply-sync`) omitted
    `component_name`, which `BomItemRequest.component_name` requires (no default) —
    every call would 422. Added it.
  - `ApiClient.ApplyChanges()` (→ `POST /api/v1/solidworks/apply-changes`) sent
    `{ model_name, changes }` as a JSON object body. The backend route is
    `apply_changes(model: str, changes: list[PendingChange])` — FastAPI binds the
    plain `model: str` as a **query parameter** and the sole `list[...]` parameter
    as the **entire raw-array** request body. Fixed to
    `?model=<name>` + a bare JSON array body.
  - `ApiClient.UploadSingleImage()` (→ `POST /api/v1/solidworks/images`) sent a JSON
    body with 6 base64 image variants. The backend endpoint is
    `upload_image(part_number: str = Form(...), file: UploadFile = File(None))` —
    i.e. **multipart/form-data**, one file. Fixed to send multipart with
    `part_number` + the best single available image (isometric view, falling back
    to the largest thumbnail). **The backend only stores one image per part today**
    — uploading the full thumbnail/view set needs a backend change (out of scope
    here, since this pass may not touch `backend/`).
  - Every response DTO in `ApiClient.cs` (`BomUploadResult`, `BomSyncResult`,
    `ApplyResult`, `LicenseInfo`, `VaultStats`, `VaultNode`, ...) is a plain
    PascalCase C# class with no `[JsonProperty]` attributes, deserialized with
    Newtonsoft's **default** (exact-name) matching — but every backend response is
    snake_case (`session_id`, `items_added`, `total_size_mb`, ...). Multi-word
    fields were silently deserializing to their default (0/null) even on a fully
    successful call — e.g. `SyncToBlackbox()`'s "X items added, Y updated" message
    box always showed 0/0. Fixed by adding a shared `JsonSerializerSettings` with
    Newtonsoft's `SnakeCaseNamingStrategy` used on every (de)serialize call in
    `ApiClient.cs`.
  - `login`/auth shape (`POST /api/v1/auth/plugin-login` → `{api_key, client_type,
    client_version}`, response has `session_id`) was already correct — verified,
    not changed.

- **Settings split-brain**: `ApiClient` read/wrote `%LOCALAPPDATA%\BlackboxBOM\config.json`
  while `SettingsForm`'s Save button wrote a *different* file,
  `%LOCALAPPDATA%\BlackboxBOM\settings.json`, via the `PluginSettings` class. Clicking
  "Save Settings" would not change what `ApiClient` actually used until SolidWorks was
  restarted. Unified onto a single file (`settings.json` via `PluginSettings`); the
  Save button now also calls `_apiClient.SaveSettings(...)` so the in-memory URL/key
  used by the current session updates immediately.

- **`.csproj` / interop references** — see "Interop references" section below.

- **Installer (`Installer\BlackboxBOM_SolidWorks.iss`)**: fixed the interop DLL
  filenames it packages (`SolidWorks.Interop.sldworks.dll` /
  `.swconst.dll` / `.swpublished.dll` — matches the `.csproj` change above, and now
  all three, not two). Also fixed `[Run]`/`[UninstallRun]`: they called
  `regsvr32.exe` on the add-in DLL and on an interop DLL — `regsvr32` only works
  for native COM DLLs with a `DllRegisterServer` export, which a managed .NET
  assembly doesn't have (it was silently no-op'ing under `/s`), and an interop
  reference assembly should never be registered as a COM server at all. Now calls
  `RegAsm.exe /codebase` (via Inno Setup's `{dotnet4064}` constant) on the add-in
  DLL only.

- Added `BlackboxBOM.SolidWorks.sln` (classic `.sln`, not the newer `.slnx`, for
  broad VS 2019+ compatibility) so the project can be opened by double-clicking
  the solution as the docs already described, instead of only via `dotnet`/MSBuild
  against the bare `.csproj`.

## Known limitations of this pass (could not verify without the real SDK)

These call SolidWorks Interop APIs that plausibly exist but couldn't be confirmed
against the real type libraries on this machine — please keep an eye on them during
your first build/test and report back if any of them don't compile or behave oddly:

- `BomExtractor.CalculateQuantity()` calls `IAssemblyDoc.GetComponents(false)`
  (the older, non-"2" overload).
- `BomExtractor.GetMatedInstanceCount()` calls `IComponent2.GetMates()`.
- `ModelUpdater.UpdateMaterial()` calls `ISldWorks.GetMaterialManager()`.

None of these were touched — they were left as-is rather than "fixed" on a guess.

## Prerequisites
- [ ] Windows + **SolidWorks** installed (2018+; the three interop DLLs below ship
      inside the install).
- [ ] **.NET Framework 4.8** Developer Pack (target is `net48`).
- [ ] Visual Studio 2019+ **or** Build Tools (MSBuild). `dotnet build` also works
      (verified in this pass — NuGet restore succeeds without SolidWorks present).
- [ ] Inno Setup 6 (only if building the installer).
- NuGet: `Newtonsoft.Json` now restores automatically via `PackageReference` — no
  manual `packages/` folder or `nuget restore` step needed anymore.

## Interop references — what you must supply
The `.csproj` no longer uses a `tlbimp`-based `<COMReference>` (that required the
exact SolidWorks type library GUID/version registered on the build machine, and only
covered 1 of the 3 namespaces the code actually uses). It now references the
pre-built interop DLLs directly:

- `SolidWorks.Interop.sldworks.dll`
- `SolidWorks.Interop.swconst.dll`
- `SolidWorks.Interop.swpublished.dll`

These ship inside every SolidWorks install, typically at:
```
C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist\
```
(the exact path varies by edition/year — look for an `api\redist` folder under your
SolidWorks install directory). The `.csproj`'s `SolidWorksApiRedistDir` MSBuild
property defaults to the path above; if yours differs, either edit that property or
build with:
```
msbuild BlackboxBOM.SolidWorks.sln /p:Configuration=Release /p:SolidWorksApiRedistDir="D:\SOLIDWORKS 2024\api\redist\"
```
If the DLLs aren't found there, the build now fails fast with that exact message
(via a `CheckSolidWorksInterop` target) instead of a wall of "type or namespace not
found" errors.

## Build
1. [ ] Open `BlackboxBOM.SolidWorks.sln` in Visual Studio, or from a shell:
   ```
   msbuild BlackboxBOM.SolidWorks.sln /p:Configuration=Release
   ```
   (NuGet restores automatically on build; no separate restore step needed.)
   Output: `BlackboxBOM.SolidWorks\bin\Release\BlackboxBOM.SolidWorks.dll` (built
   with `RegisterForComInterop=true`).
2. [ ] If the build fails with "SolidWorks interop assemblies not found", pass the
   correct `SolidWorksApiRedistDir` as shown above.
3. [ ] If MSBuild still can't resolve types from the interop DLLs, open VS **as
   Administrator** once (some SolidWorks installs need this the first time to
   register their COM type libraries).

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
       Settings persist to `%LOCALAPPDATA%\BlackboxBOM\settings.json` (single file
       now — see "Settings split-brain" above).

## Round-trip test (the real "working" proof)
1. [ ] Open a multi-level assembly (`.SLDASM`) with at least one sub-assembly.
2. [ ] Task pane → **Extract BOM** → **Push to Blackbox** (this calls
       `UploadBom` → `POST /api/v1/solidworks/sync`, the endpoint that builds the
       real BomTemplate + item tree).
3. [ ] Verify in the app (any one is sufficient):
       - `GET /api/v1/solidworks/` → the assembly is listed.
       - `GET /api/v1/solidworks/bom-structure?source_file=<AssemblyName.SLDASM>` → nested tree with parent/child + quantities + a `levels` count > 1.
       - Parts screen shows the created parts; BOM editor shows the imported multi-level BOM.
4. [ ] Change a quantity in CAD, re-push → confirm the BOM **rebuilds** (no duplicate rows) — the sync is idempotent per source file.
5. [ ] With the fixed traversal, also confirm component **counts look right** for a
       deeply nested assembly (2-3 levels) — this is the bug that used to duplicate
       every nested part once per level.

## Known gaps to decide on
- [ ] **Licensing**: `/api/v1/solidworks/license/{verify,activate}` return `501 Not Implemented`. Either implement licensing or make the plugin skip the license gate for internal use.
- [ ] **Health check**: `ApiClient.IsApiAvailable()` calls `/api/v1/health` — confirm that exact path exists on your deployment (non-blocking; push works regardless).
- [ ] **Image round-trip is partial**: only one image per part uploads (backend
      limitation, see above), and `GET /api/v1/solidworks/images/{part_number}`
      returns metadata only (no image bytes) — the task pane's "preview"/"export
      image" features have nothing to render until the backend actually serves
      image bytes. Backend change needed; out of scope for this pass.
- [ ] **Sign for distribution** (recommended): Authenticode-sign `BlackboxBOM.SolidWorks.dll` and the Inno Setup output with `signtool` to avoid SmartScreen/add-in trust warnings.

## Package (optional)
- [ ] Build `Installer\BlackboxBOM_SolidWorks.iss` with Inno Setup → `setup.exe` that installs + registers the add-in and its dependencies (filenames and registration already fixed to match this pass's `.csproj`/interop changes — see above).

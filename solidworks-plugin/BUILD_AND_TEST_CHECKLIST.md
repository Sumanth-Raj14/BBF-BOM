# SolidWorks Add-in — Build, Install & Round-Trip Test Guide

**Who this is for:** anyone building/installing the Blackbox BOM SolidWorks add-in for the
first time. No prior SolidWorks add-in development experience assumed.

**Where this must run:** a **Windows machine with SolidWorks installed**. The plugin uses
SolidWorks COM interop (`SolidWorks.Interop.sldworks` / `.swconst` / `.swpublished`), which
SolidWorks ships only inside a real install — it cannot be built for real, installed, or
tested without one. Nothing in this repo's CI can do that part for you (see
["What CI does and doesn't check"](#what-ci-does-and-doesnt-check) below) — this document
is the actual procedure to run on your SolidWorks machine.

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| **SolidWorks** | 2018 or later, installed and licensed on this machine. (The plugin has not been validated against a specific year/SP — see [Known limitations](#known-limitations-not-verifiable-without-the-real-sdk).) |
| **Visual Studio** | 2019 or later (the checked-in `.sln` was authored for VS 2022 / `VisualStudioVersion = 17.0`, but any VS that supports SDK-style `.csproj` files works). **Visual Studio Build Tools** (no full IDE) also works via `msbuild`/`dotnet build`. |
| **.NET Framework 4.8 Developer Pack** | The add-in targets `net48`. Visual Studio's installer offers this under *Individual Components → .NET Framework 4.8 targeting pack*; standalone download: search ".NET Framework 4.8 Developer Pack". |
| **.NET SDK** (optional) | If you prefer `dotnet build` over the VS IDE / `msbuild.exe`, install any recent .NET SDK (6/8/10) — it can still build `net48` projects as long as the targeting pack above is installed. |
| **Inno Setup 6** | Only needed if you want to build the installer (`Installer\BlackboxBOM_SolidWorks.iss`). Download from jrsoftware.org. |
| NuGet | `Newtonsoft.Json` restores automatically via `PackageReference` — no manual step. |

### Interop DLLs — where they come from

The `.csproj` does **not** use a `tlbimp`-generated `<COMReference>` (that would require the
exact SolidWorks type-library GUID/version registered on *this* machine, which breaks the
moment you build on a different machine or SolidWorks version). Instead it references the
pre-built interop DLLs directly by `HintPath`, from an MSBuild property:

```
SolidWorksApiRedistDir  (default: C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist\)
```

These three files ship inside **every** SolidWorks install, typically at:

```
C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist\SolidWorks.Interop.sldworks.dll
C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist\SolidWorks.Interop.swconst.dll
C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist\SolidWorks.Interop.swpublished.dll
```

(the exact path varies by edition/year — look for an `api\redist` folder under your
SolidWorks install directory). If yours differs from the default, either:

- edit `SolidWorksApiRedistDir` at the top of `BlackboxBOM.SolidWorks\BlackboxBOM.SolidWorks.csproj`, or
- pass it on the command line: `msbuild ... /p:SolidWorksApiRedistDir="D:\SOLIDWORKS 2024\api\redist\"`

If the DLLs aren't found there, the build fails immediately with that exact message (via a
`CheckSolidWorksInterop` MSBuild target) instead of a wall of confusing "type or namespace
not found" errors — this is expected and tells you exactly what to fix.

---

## 2. Build in Visual Studio

1. Open `BlackboxBOM.SolidWorks.sln`.
2. Set the solution configuration to **Release** (top toolbar dropdown).
3. **Build → Build Solution** (or `Ctrl+Shift+B`). NuGet restores automatically; no manual
   restore step needed.
4. Output: `BlackboxBOM.SolidWorks\bin\Release\BlackboxBOM.SolidWorks.dll`, built with
   `RegisterForComInterop=true`.

Command-line equivalent:
```
msbuild BlackboxBOM.SolidWorks.sln /p:Configuration=Release
```
or
```
dotnet build BlackboxBOM.SolidWorks.sln /p:Configuration=Release
```

**If the build fails with "SolidWorks interop assemblies not found"** — pass the correct
`SolidWorksApiRedistDir` as shown in [section 1](#interop-dlls--where-they-come-from).

**If MSBuild still can't resolve types from the interop DLLs** — open VS **as
Administrator** once; some SolidWorks installs need this the first time to register their
COM type libraries.

---

## 3. Install and register the add-in

Two options — pick one:

### Option A — the installer (recommended for end users)
1. Build the installer once (needs Inno Setup 6 installed):
   ```
   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" Installer\BlackboxBOM_SolidWorks.iss
   ```
   Output: `Installer\installer_output\BlackboxBOM_SolidWorks_Setup_1.0.0.exe`.
2. Run the installer as Administrator. It:
   - copies the add-in DLL, its `.pdb`, `Newtonsoft.Json.dll`, and the three SolidWorks
     interop DLLs into `Program Files\BlackboxBOM\SolidWorks`;
   - registers the add-in for COM interop via `RegAsm.exe /codebase` (the correct tool for
     a managed .NET add-in — see the comment in the `.iss` file for why `regsvr32` does
     **not** work here);
   - writes the SolidWorks add-in registry keys (`HKLM\SOFTWARE\SolidWorks\Addins\{...}`)
     and the auto-load-at-startup key;
   - writes placeholder `ApiUrl`/`ApiKey` registry values under `HKCU\Software\BlackboxBOM`
     (the plugin's actual settings file, described in step 4, takes precedence once you
     save Settings from inside SolidWorks).
3. To uninstall: **Settings → Apps → Blackbox BOM SolidWorks Plugin → Uninstall** (or the
   Start Menu → Blackbox BOM SolidWorks Plugin → Uninstall shortcut). This runs
   `RegAsm.exe /unregister` and removes the registry keys/files.

### Option B — register a Debug/dev build directly (for plugin development)
- Building in an **elevated** Visual Studio auto-registers COM interop on every build
  (because of `RegisterForComInterop=true`).
- Otherwise, register manually:
  ```
  "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe" /codebase bin\Release\BlackboxBOM.SolidWorks.dll
  ```
  To unregister: same command with `/unregister`.

### Verify it loaded
Restart SolidWorks → **Tools → Add-Ins** → confirm "Blackbox BOM" is listed and checked.
A **Blackbox BOM** task pane icon should appear on the right edge of the SolidWorks window.

---

## 4. Configure the backend connection

1. **Create an API key** in the Blackbox BOM web app: log in → **API Keys** screen →
   **Create Key** → copy the `bkb_…` value (shown once, cannot be retrieved later).
   > ⚠️ Create the key against a **PostgreSQL** deployment. The key-create SQL uses a
   > Postgres-only `::json` cast and will not run against a SQLite/dev database.
2. In SolidWorks: **Blackbox BOM task pane → Settings** (or the "Settings" toolbar/menu
   command) → set:
   - **API URL**: `http://<host>:8000` (e.g. `http://localhost:8000`)
   - **API Key**: the `bkb_…` value from step 1
   - Click **Save**. This writes `%LOCALAPPDATA%\BlackboxBOM\settings.json` and updates
     the running session's `ApiClient` immediately (no SolidWorks restart needed).
3. **How authentication actually works** (fixed this pass — previously the add-in never
   authenticated at all, see [Change history](#change-history)): the `ApiClient` the add-in
   actually uses (`BlackboxBomAddin`'s default-constructor client) attaches the saved API
   key as an `X-API-Key` header on **every** request, the moment Settings are loaded or
   saved. The backend's auth dependency
   (`app/core/deps.py::_authenticate_by_api_key`) checks this header first, ahead of any
   Bearer token, so this alone authenticates `/solidworks/sync`, `/apply-sync`, `/images`,
   and `/apply-changes`. `POST /api/v1/auth/plugin-login` (`{api_key, client_type:
   "solidworks_addin", client_version}` → a Bearer `session_id`) still exists and still
   works, but nothing in the add-in calls it automatically today — it's only exercised via
   `ApiClient`'s 2-argument constructor (`ApiClient(baseUrl, apiKey)`), which the add-in
   does not construct. If a missing/invalid key means every protected call returns 401/403,
   the add-in now surfaces a real "Authentication failed - check API key/URL in Settings"
   error instead of a fake success (see the troubleshooting row below).
4. Optional sanity check: `GET http://<host>:8000/api/v1/health` should return
   `{"status": "healthy", ...}` — this is a real, confirmed route (verified by reading
   `backend/app/api/api_v1.py`) used by `ApiClient.IsApiAvailable()`. It's non-blocking;
   BOM push works even if this check is skipped.

---

## 5. In-CAD round-trip test (the real "working" proof)

1. Open a multi-level assembly (`.SLDASM`) that has at least one sub-assembly (2–3 levels
   deep is a good test of the hierarchy fix described in
   [Change history](#change-history)).
2. Task pane → **Extract BOM** → **Push to Blackbox** (calls `UploadBom()` →
   `POST /api/v1/solidworks/sync`, the endpoint that builds the real `BomTemplate` +
   parent/child item tree).
3. Verify in the web app — any one of these is sufficient:
   - `GET /api/v1/solidworks/` → the assembly is listed as an imported BOM.
   - `GET /api/v1/solidworks/bom-structure?source_file=<AssemblyName.SLDASM>` → a nested
     `tree` with correct parent/child relationships, quantities, and a `levels` count > 1
     for a multi-level assembly.
   - The Parts screen shows the newly-created parts; the BOM editor shows the imported
     multi-level structure.
4. **Idempotency check**: change a component's quantity in CAD (e.g. edit a mate pattern
   count) and re-push. The BOM should **rebuild** cleanly — same template, no duplicate
   rows — since re-sync deletes and rebuilds the item tree for that source file.
5. **Hierarchy correctness check**: for a 2–3 level assembly, confirm the component counts
   at each level look right (not inflated). This directly exercises the fix described in
   [Change history](#change-history) — the old code duplicated every nested component
   once per level of assembly nesting.

---

## 6. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Build fails: "SolidWorks interop assemblies not found at ..." | `SolidWorksApiRedistDir` doesn't point at a real SolidWorks install. See [section 1](#interop-dlls--where-they-come-from). |
| Build fails with many `CS0246`/`CS1061` errors mentioning `SolidWorks.Interop.*` types | You likely built with `/p:UseNuGetSolidWorksInterop=true` (a CI-only diagnostic flag — see [Community NuGet interop experiment](#community-nuget-interop-experiment)). Build normally (without that flag) against your real SolidWorks install. |
| Add-in doesn't appear in **Tools → Add-Ins** | Registration didn't happen. Re-run the installer as Administrator, or manually `RegAsm.exe /codebase` the DLL (see [section 3](#3-install-and-register-the-add-in)). Confirm `HKLM\SOFTWARE\SolidWorks\Addins\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}` exists. |
| Add-in is checked in Tools → Add-Ins, but no task pane appears | Check the Windows Event Viewer / a debugger attached to `SLDWORKS.exe` for exceptions in `ConnectToSW`/`CreateTaskPane` — these are swallowed into a `MessageBox` in `BlackboxBomAddin.cs`, so look for that dialog too. |
| "Sync failed" / HTTP errors when pushing a BOM | Confirm **API URL** in Settings is reachable from this machine (no trailing slash issues; try the same URL in a browser at `/api/v1/health`). Confirm the API key was created against the Postgres deployment (see [section 4](#4-configure-the-backend-connection)). |
| "Authentication failed - check API key/URL in Settings (HTTP 401)." / "...(HTTP 403)." on Sync / Extract Images / Apply Blackbox Changes | The saved **API Key** is missing, wrong, expired, or was created against a different backend than **API URL** points at. Re-check both in Settings (see [section 4](#4-configure-the-backend-connection)) and re-save. This is a real, honest failure, surfaced this pass — earlier versions of the add-in sent these requests with no credentials at all and silently reported a fake "Sync complete! 0 items" instead (see next row and [Change history](#change-history)). |
| 422 error on push | Should not happen after this pass's fixes (see [Change history](#change-history) — `component_name` is now always sent). If it recurs, compare the JSON `ApiClient.cs` sends against `BomItemRequest` in `backend/app/api/endpoints/solidworks_integration.py`. |
| "Sync complete! 0 items added, 0 items updated" even though items clearly synced | **Should no longer be possible at all** as of this pass: any non-2xx response (including an unauthenticated 401 — the actual root cause behind this symptom historically, since the add-in never attached any credentials, see [Change history](#change-history)) is now detected and thrown as a real exception *before* the response body is deserialized into the result DTO, so a failed call now shows an "Authentication failed..." or "HTTP ### ..." error dialog instead of a fake success message. A previous pass separately fixed the response-DTO snake_case mismatch (`SnakeCaseNamingStrategy`) that could also zero out these fields on an otherwise-successful call. If you still see this exact message, the sync genuinely returned HTTP 2xx with `items_added`/`items_updated` both legitimately 0 (e.g. re-syncing an unchanged BOM only touches existing rows) — check the web app's BOM/Parts screens to confirm. |
| License-related dialogs / `501` errors | `/api/v1/solidworks/license/{verify,activate}` are intentionally not implemented server-side yet (see [Known gaps](#known-gaps-to-decide-on)). Not required for internal use — ignore or wire around the license gate. |
| Component/part images never show a preview | Known limitation — only one image per part round-trips today, and metadata-only on read. See [Known gaps](#known-gaps-to-decide-on). |
| SmartScreen / "Windows protected your PC" when running the installer or add-in | The build isn't Authenticode-signed. Either click "More info → Run anyway" for internal use, or sign `BlackboxBOM.SolidWorks.dll` and the installer `.exe` with `signtool` before distributing. |
| `dotnet build`/`msbuild` can't find MSBuild/dotnet at all | Install Visual Studio 2019+ (or VS Build Tools) or a .NET SDK — see [section 1](#1-prerequisites). |

---

## 7. What CI does and doesn't check

`.github/workflows/solidworks-plugin.yml` runs on every push/PR touching
`solidworks-plugin/**`, on a GitHub-hosted `windows-latest` runner. Being honest about its
scope:

- **It cannot do a certified build or any in-CAD testing.** GitHub-hosted runners have no
  SolidWorks install, and SolidWorks does not publish the real interop DLLs anywhere public
  (see [section 1](#interop-dlls--where-they-come-from)). Sections 2–5 of this document
  must be run by a human on a real SolidWorks machine — that is not optional and CI cannot
  substitute for it.
- **What it does check, for real, on every push:**
  1. `dotnet restore` on the solution — catches broken NuGet package references.
  2. A **guarded** attempt at the real/official build (no interop override). On a
     GitHub-hosted runner this is *expected* to fail with exactly one specific error
     ("SolidWorks interop assemblies not found…"); the workflow asserts the failure is
     *that exact one* — if the build ever fails for a different reason, that's a real
     regression and the CI job fails for real (not silently green).
  3. If that official build ever *succeeds* (only possible if you point this workflow at a
     self-hosted Windows runner that has SolidWorks installed, or that supplies
     `SolidWorksApiRedistDir`), CI treats it as a genuine build: it uploads the add-in DLL
     and builds + uploads a real Inno Setup installer as workflow artifacts.
  4. A **best-effort, `continue-on-error`, purely informational** compile against
     third-party NuGet packages that happen to share the real interop assembly names (see
     [Community NuGet interop experiment](#community-nuget-interop-experiment) below). This
     never fails the job and is not a certified build — it exists only to catch basic
     C#-language mistakes (missing `using`s, namespace collisions, ambiguous references)
     that would otherwise go completely unchecked until someone's real SolidWorks build.
- If you have a spare Windows machine with SolidWorks installed, you can turn it into a
  [self-hosted GitHub Actions runner](https://docs.github.com/actions/hosting-your-own-runners)
  and this same workflow will then produce real, certified build/installer artifacts on
  every push.

---

## 8. Known limitations (not verifiable without the real SDK)

These call SolidWorks Interop APIs that are correct, current, documented SolidWorks API
members (confirmed against a general understanding of the SolidWorks API surface), but
could not be exercised against the real type libraries in this pass's environment — keep an
eye on them during your first real build/test:

- `BomExtractor.CalculateQuantity()` calls `IAssemblyDoc.GetComponents(false)` (the older,
  non-"2" overload).
- `BomExtractor.GetMatedInstanceCount()` calls `IComponent2.GetMates()`.
- `ModelUpdater.UpdateMaterial()` calls `ISldWorks.GetMaterialManager()`.

None of these were changed — they were left as-is rather than "fixed" on a guess.

## 9. Known gaps to decide on

- **Licensing**: `/api/v1/solidworks/license/{verify,activate}` return `501 Not
  Implemented`. Either implement licensing or make the plugin skip the license gate for
  internal use.
- **Image round-trip is partial**: only one image per part uploads (backend limitation),
  and `GET /api/v1/solidworks/images/{part_number}` returns metadata only (no image bytes)
  — the task pane's "preview"/"export image" features have nothing to render until the
  backend actually serves image bytes. Backend change needed; out of scope for the
  CI/installer/checklist pass that produced this document (which was restricted to
  `solidworks-plugin/` + `.github/workflows/` + docs — no `backend/` changes).
- **Sign for distribution** (recommended): Authenticode-sign `BlackboxBOM.SolidWorks.dll`
  and the Inno Setup output with `signtool` to avoid SmartScreen/add-in trust warnings.
- **`ApiClient.GetBom()` is dead code with a real bug**: nothing in the project calls it
  today, but if it's ever wired up, deserializing the backend's response will throw —
  `BomData.ModelType` is typed as the SolidWorks `swDocumentTypes_e` enum, while the
  backend's `GET /api/v1/solidworks/bom` returns `model_type` as a free-text string (e.g.
  `"Assembly"`) that doesn't match any enum member name. Left as a documented note rather
  than "fixed" on a guess, since the right fix depends on a wire-format decision (string vs.
  enum) — see the comment on `GetBom()` in `ApiClient.cs`.

---

## Change history

### This pass (runtime auth wiring)

**The core bug fixed this pass:** the add-in never actually authenticated at runtime. All
the request/response shape fixes from prior passes were correct, but every one of those
requests still went out with **no credentials at all** — `ApiClient.Authenticate()` (which
sets a Bearer header) was only ever called from the unused 2-argument constructor, while
`BlackboxBomAddin.ConnectToSW` constructs its `ApiClient` with the parameterless
constructor, and no `X-API-Key` header was attached anywhere either. The backend correctly
replied `401` to every one of these calls — but `UploadBom()`/`SyncBom()`/`ApplyChanges()`
unconditionally ran `JsonConvert.DeserializeObject` on that 401 body regardless of status
code, producing a default-valued (`ItemsAdded = 0`, `ItemsUpdated = 0`, `Success = false`
but never checked) DTO — which `SyncToBlackbox()`/`BomPanel.OnSyncClick()` then reported as
"Sync complete! 0 items added, 0 updated." with no indication anything had failed.

Fixed:
- **`ApiClient.ApplyAuthHeader()`** (new): attaches the saved API key as an `X-API-Key`
  header on the client's `HttpClient` — the header `app/core/deps.py`'s
  `_authenticate_by_api_key` checks first, ahead of any Bearer token. Called from
  `LoadSettings()` (so both constructors, and therefore the add-in's actual runtime client,
  pick it up) and from `SaveSettings()` (so Settings dialog "Save"/"Test Connection" updates
  it immediately, matching the existing settings-write behavior). This was chosen over
  forcing a `POST /api/v1/auth/plugin-login` round-trip at startup because it needs no
  network call — `Authenticate()`/`plugin-login` remain available (2-arg constructor,
  unchanged) for anything that wants an explicit Bearer session, but nothing forces that
  blocking call during `ConnectToSW`.
- **`ApiClient.EnsureSuccess()`** (new): checks the HTTP status *before* deserializing a
  response body into a result DTO, in `UploadBom()`, `SyncBom()`, `ApplyChanges()`, and
  `UploadSingleImage()`. A 401/403 now throws "Authentication failed - check API key/URL in
  Settings"; any other non-2xx throws the HTTP status + response body. Both `SyncToBlackbox()`
  and `BomPanel.OnSyncClick()` already wrap their calls in `try/catch` and show
  `ex.Message` — no UI code needed to change for the honest error to surface.
- **`ApiClient.UploadImages()`/`UploadSingleImage()`**: the per-image `try/catch` used to
  swallow every failure into a `Debug.WriteLine` (including auth failures), so "Extract
  Images" always reported "Extracted N component images" even if zero images made it to the
  server. Failures are now collected and thrown as a single exception listing every failed
  part, which `ExtractImages()`'s existing `catch` block surfaces.
- **Pre-existing, unrelated compile bug fixed in passing**: `ApiClient.PostAsync()` (the
  private POST helper) returned a plain `HttpResponseMessage` (already resolved internally
  via `.Result`), while every one of its six call sites (`Authenticate()`, `UploadBom()`,
  `SyncBom()`, `SendUpdate()`, `ApplyChanges()`, `ActivateLicense()`) called
  `.Result`/`.Wait()` on that return value again, as if it were a `Task` — `CS1061:
  'HttpResponseMessage' does not contain a definition for 'Result'`. This is an
  assembly-independent C# error with nothing to do with SolidWorks interop, confirmed
  present at the prior commit via a real Roslyn compile (the `UseNuGetSolidWorksInterop`
  diagnostic build) before this pass touched the file — it just couldn't be seen by the
  "official" build path, which fails earlier at the interop-assembly guard. Fixed by making
  `PostAsync` `async Task<HttpResponseMessage>`; no call sites needed to change.
- **Docs**: this section, [section 4](#4-configure-the-backend-connection), the
  troubleshooting table, and [Known gaps](#known-gaps-to-decide-on) updated to match actual
  behavior (previously section 4 described the `plugin-login`/Bearer flow as if it ran
  automatically, which it never did).

**Verification performed** (no SolidWorks install in this environment, consistent with
prior passes): `dotnet build BlackboxBOM.SolidWorks.sln /p:Configuration=Release` still
fails at exactly the same "SolidWorks interop assemblies not found" guard as before this
pass's changes (section 7's documented, expected outcome on a machine/CI runner with no
SolidWorks install). `dotnet build ... /p:UseNuGetSolidWorksInterop=true` (the informational
diagnostic build) was run both before and after this pass's `ApiClient.cs` changes: the
total error count went from 260 → 248, all 12 of the removed errors were the
`PostAsync`/`.Result` bug above (6 unique locations, each reported twice) and were the only
`ApiClient.cs` errors either build produced — i.e. zero new compile errors were introduced,
and the pre-existing bug above is now actually fixed.

### This pass (CI + installer + checklist)

Environment note: same as before — **no SolidWorks install** in this environment, so
sections 2–5 of this document still cannot be executed here. What *could* be done for real
this time: a .NET SDK (10.0) and internet access to nuget.org were both available, which
made it possible to actually run `dotnet build`/`dotnet restore` for real (not just read the
code) and to run a genuine experiment described next.

#### Community NuGet interop experiment

To see whether CI could do more than "restore only", this pass searched nuget.org and found
that a third party ("avidesk") publishes packages under the *exact* real assembly names this
project references — `SolidWorks.Interop.sldworks`, `SolidWorks.Interop.swconst`,
`SolidWorks.Interop.swpublished` (version `32.1.0` at time of writing). The `.csproj` gained
an opt-in MSBuild flag, `UseNuGetSolidWorksInterop`, that swaps these in via `PackageReference`
instead of the local `HintPath` references, specifically so CI could attempt a real compile.

Building against them for real surfaced two useful categories of result:

1. **Four genuine, interop-version-independent C# bugs**, i.e. bugs that would occur no
   matter which interop assemblies (these NuGet ones, or the real SolidWorks-shipped ones)
   were used — all fixed in this pass:
   - `Models.cs`: `BomData.ModelType` was declared as the bare-qualified
     `SolidWorks.Interop.swconst.swDocumentTypes_e`. Because this file's own namespace is
     `BlackboxBOM.SolidWorks`, and `BlackboxBOM` (the parent namespace) also contains a
     nested namespace literally named `SolidWorks` (this project's own root namespace), an
     unqualified `SolidWorks.Interop...` reference written *inside* that namespace resolves
     `SolidWorks` against the enclosing `BlackboxBOM.SolidWorks` first — not the global
     `SolidWorks` interop assembly — causing `CS0234` ("'Interop' does not exist in the
     namespace 'BlackboxBOM.SolidWorks'"). Fixed with an explicit `global::` prefix.
   - `ImageExtractor.cs`: used `[DllImport]`/`[StructLayout]`/`LayoutKind` (P/Invoke for
     `GetWindowRect`) without `using System.Runtime.InteropServices;`. Added the `using`.
   - `BomExtractor.cs` and `ModelUpdater.cs`: both declared five total local
     variables/parameters of type `IFeatureData` (the bare, non-suffixed interface) purely
     as a container immediately narrowed via `is I...FeatureData2` pattern matching (e.g.
     `if (featData is IExtrudeFeatureData2 extrudeData)`). Reflection against the real,
     published `SolidWorks.Interop.sldworks` NuGet DLL confirms no type named
     `IFeatureData` (or any `IFeatureData*`) exists in it at all. Since nothing in this
     codebase ever calls a member directly on the bare `featData` variable (only the
     pattern-narrowed one), changing the declared type to `object` is 100% behavior-
     preserving and removes the dependency on a type that may not exist in every
     SolidWorks API generation. Done in both files.
   - `BomPanel.cs`: `View = View.Details` inside a `ListView` object initializer was
     ambiguous — `System.Windows.Forms` (imported for the `ListView` itself) and
     `SolidWorks.Interop.sldworks` (imported for `ISldWorks`) both declare a type named
     `View` (the ListView display-mode enum vs. a SolidWorks viewport interface),
     triggering `CS0104`. Fixed by fully qualifying `System.Windows.Forms.View.Details`.
2. **~130 further compile errors that are NOT plugin bugs** — they reflect this specific
   third-party package's API surface diverging substantially from the real, current,
   documented SolidWorks API this plugin is written against. For example, building against
   it fails on calls to `IAssemblyDoc.GetComponents2`, `IModelDoc2.GetBoundingBox`,
   `IPartDoc.GetMaterial`/`GetMaterialPropertyValues`, `ISldWorks.GetMaterialManager`,
   `ISketch.GetDimensions`, `IConfigurationManager.GetConfigurationByName`, and several
   `ISldWorks` event hooks (`ActiveDocChangeNotify`, `FileSaveNotify`, ...) — all real,
   long-documented, heavily-used SolidWorks API members that are simply missing or shaped
   differently in this particular NuGet package release. **These were deliberately left
   unfixed** — "fixing" the plugin to match this one unofficial package's incomplete
   surface would make the code *wrong* against the real, official SolidWorks SDK that
   matters. See the `UseNuGetSolidWorksInterop` comment in the `.csproj` for the same note
   in context, and [section 7](#7-what-ci-does-and-doesnt-check) for how CI treats this
   (informational, `continue-on-error`, never blocking).

#### Other fixes

- **Installer** (`Installer\BlackboxBOM_SolidWorks.iss`): removed a Start Menu shortcut
  pointing at `{app}\Settings.exe` — no such executable exists or ever did; Settings is a
  WinForms dialog (`SettingsForm.cs`) opened from *inside* SolidWorks via the add-in's
  "Settings" command, not a standalone program. The shortcut would have been dead on every
  install.
- **CI**: added `.github/workflows/solidworks-plugin.yml` — see
  [section 7](#7-what-ci-does-and-doesnt-check) for exactly what it does and doesn't
  validate.
- **`.gitignore`**: added `*.log` (local/CI build logs produced by the new workflow's
  scripts when run locally).

### Prior pass (WS2 — build-prep)

Done in an environment with **no SolidWorks install and no MSBuild**, so nothing was
compiled against the real Interop assemblies at that time — everything below was fixed by
careful reading against the SolidWorks API's documented shapes and by diffing against the
actual backend endpoints (`backend/app/api/endpoints/solidworks_integration.py`,
`backend/app/api/endpoints/auth.py`).

- **Hard compile blockers** (the project could not have built before this pass):
  - `BlackboxBomAddin.cs` applied `[SwAddin(...)]` but the attribute class was never
    defined anywhere → added `SwAddinAttribute.cs`.
  - `BomExtractor.cs` called `ExtractFromPart(...)` for part (non-assembly) documents, but
    that method didn't exist → implemented it.
  - `BomExtractor.cs` had a literal syntax error: `sketch-plane?.Name` → replaced with the
    `"Unknown"` literal.
  - `ModelUpdater.ApplyChangesToMultipleModels` passed `ref errors, ref warnings` to
    `OpenDoc6` without ever declaring `errors`/`warnings` → declared them.
  - `ApiClient.cs` used LINQ (`.Select()`) without `using System.Linq;` → added it.
  - The `.csproj` declared only **one** SolidWorks COM reference (`SldWorks`), but the code
    uses three interop namespaces → fixed to reference all three.
- **Multi-level BOM correctness** (the stated point of this plugin):
  - `BomExtractor.ExtractFromAssembly` called `IAssemblyDoc.GetComponents2(false)` (already
    returns **every** component flattened, including nested sub-assemblies) and then
    recursed calling `GetComponents2(false)` **again** — duplicating every descendant once
    per level of nesting. Fixed to call `GetComponents2(true)` (direct children only) at
    each level and recurse manually, threading a `level` counter through.
  - `BomItem.Level`/`BomItem.IsAssembly` existed on the model but were never actually set —
    now set on every item during the fixed traversal above.
- **Request shape vs. the real backend**:
  - `ApiClient.SyncBom()` omitted `component_name`, which `BomItemRequest.component_name`
    requires (no default) — every call would 422. Added it.
  - `ApiClient.ApplyChanges()` sent `{ model_name, changes }` as a JSON object body, but the
    backend route binds `model: str` as a query parameter and the sole `list[...]`
    parameter as the entire raw-array body. Fixed to `?model=<name>` + a bare JSON array.
  - `ApiClient.UploadSingleImage()` sent a JSON body with 6 base64 image variants; the
    backend takes multipart/form-data with one file. Fixed to send multipart with
    `part_number` + the best single available image.
  - Every response DTO in `ApiClient.cs` was plain PascalCase with no `[JsonProperty]`
    attributes, deserialized against the backend's snake_case JSON — multi-word fields
    silently stayed at their default (0/null) even on success. Fixed with a shared
    `JsonSerializerSettings` using Newtonsoft's `SnakeCaseNamingStrategy`.
  - `login`/auth shape was already correct — verified, not changed.
- **Settings split-brain**: `ApiClient` and `SettingsForm`'s Save button wrote two
  different files. Unified onto a single file (`settings.json` via `PluginSettings`).
- **Installer**: fixed interop DLL filenames packaged, and fixed `[Run]`/`[UninstallRun]` to
  call `RegAsm.exe /codebase` instead of `regsvr32` (which silently no-ops on managed DLLs).
- Added `BlackboxBOM.SolidWorks.sln` (classic format, VS 2019+ compatible).

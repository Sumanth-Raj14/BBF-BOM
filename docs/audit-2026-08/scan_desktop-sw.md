# Desktop wrapper + SolidWorks plugin audit

Scope actually present: no Electron wrapper exists in this repo (checked for
electron main.js / electron-builder config — none, only node_modules noise).
The real "desktop wrapper" is a Python PyInstaller launcher
(desktop/launcher.py + backend_entry.py + updater.py + build.py + specs +
installer.iss), and the SolidWorks plugin is the C# COM add-in under
solidworks-plugin/. Read every non-build/dist/release file in both, plus
every .cs/.csproj/.sln in the repo (excluding node_modules/_archive/
"reference ui" and the three .claude/worktrees/* duplicate copies of the
plugin, which are identical agent-worktree mirrors of the same source).

## Findings

### 1. [HIGH] solidworks-plugin csproj embeds a resource file that does not exist -> build fails
File: solidworks-plugin/BlackboxBOM.SolidWorks/BlackboxBOM.SolidWorks.csproj:95
```xml
<ItemGroup>
  <EmbeddedResource Include="Resources\BlackboxBOM.ico" />
</ItemGroup>
```
`solidworks-plugin/BlackboxBOM.SolidWorks/Resources/` does not exist anywhere
in the repo (confirmed via glob `solidworks-plugin/**/Resources/**` → no
matches). MSBuild's `EmbeddedResource` item requires the file to exist; a
missing one is a hard build error (MSB3030 "Could not find file"), not a
skippable warning. Even once a real SolidWorks install satisfies
`SolidWorksApiRedistDir` (the project's own `CheckSolidWorksInterop` guard),
the build still cannot succeed — this is a second, independent blocker no
one has hit yet because nothing in this environment can compile the project
end-to-end. Fix: either add the missing `Resources/BlackboxBOM.ico` file or
remove the `<EmbeddedResource>` line.

### 2. [MEDIUM] EventWatcher's real component-add/remove and feature events are dead code — never wired up
File: solidworks-plugin/BlackboxBOM.SolidWorks/EventWatcher.cs:103-181
`MonitorAssemblyEvents(IAssemblyDoc)` (subscribes `ComponentAddNotify`,
`ComponentRemoveNotify`, `ComponentSuppressNotify`, `ComponentUnsuppressNotify`)
and `MonitorFeatureEvents(IModelDoc2)` (subscribes `FeatureCreate`,
`FeatureModify`, `FeatureDelete`) are the only code paths that hook the
*real* SolidWorks add/remove/feature-change notifications. Grepped the whole
repo for callers: `MonitorAssemblyEvents|MonitorFeatureEvents` — matches only
inside EventWatcher.cs itself. `BlackboxBomAddin.SetupEventWatchers()`
(BlackboxBomAddin.cs:337-345) only calls `_eventWatcher.StartWatching()`,
which wires `ActiveDocChangeNotify`, `FileSaveNotify`/`FileSavePostNotify`,
and `ComponentActiveStateChangeNotify`/`ComponentVisibilityChangeNotify` —
none of which are actual add/remove/feature-create events.
`OnComponentActiveStateChange` (EventWatcher.cs:77-88) fires
`OnComponentAdded`/`OnComponentRemoved` on *activation* state (entering/
exiting component edit-in-context), not on components actually being
inserted into or deleted from the assembly. Net effect: the add-in's
advertised "real-time sync ... monitors component add/remove, feature
changes" (class doc-comment, EventWatcher.cs:10-12) never fires for the
events it names — the taskpane's "Component added/removed"/"Feature
created" status-bar notifications (BomPanel.NotifyComponentAdded/Removed/
NotifyFeatureCreated) are effectively unreachable in normal use. Low-cost
fix: call `MonitorFeatureEvents(model)` from `OnActiveDocChange`/document-
load, and call `MonitorAssemblyEvents` when the active doc is an assembly.

### 3. [MEDIUM] Real secret value committed to the repo, unused/orphaned
File: desktop/.secret_key:1
```json
{"key": "2t1ccVzPS6qcZQ_KOT-wAgdeTbqN8HxT4Hq0CqUM018"}
```
This looks like a real generated secret (same shape as `secrets.token_urlsafe`
output used elsewhere in this codebase, e.g. `launcher.py`'s
`ensure_env_secrets`). `desktop/.gitignore` only excludes `build/`, `dist/`,
`pgsql/`, `*.exe`, `*.msi`, and Python artifacts — it does **not** exclude
`.secret_key`, so this file is tracked in source control. Grepped the whole
repo (`.py`, and case-insensitive `secret_key`) for any reader of a file
literally named `.secret_key`: no match anywhere in `desktop/`, `backend/`,
or the plugin — nothing in the shipped code reads it (the real secret
lifecycle is `ensure_env_secrets()` writing `DATA_DIR\.env`, a completely
different, gitignored, runtime-generated file). This key is dead/orphaned,
but it is still a concrete leaked secret sitting in version control with no
purpose; if it was ever meaningful (e.g. a leftover dev `SECRET_KEY` from
before the current `.env`-based flow existed) it should be revoked/rotated
and deleted, not left in the tree.

## Lower-confidence / informational (not filed as top findings)

- `desktop/DURABILITY.md`'s "Live verification (2026-07-19)" section already
  documents and tracks a real Windows PITR restore-command bug
  (`pitr_restore.py` / `backup.py::restore_physical_backup` hardcode Unix
  `cp` and a Unix WAL-archive path) — this is pre-existing, already known,
  already filed as an open item; not re-reported here as new.
- `desktop/postgresql.conf.template` is shipped by `build.py`/`installer.iss`
  but never read by `launcher.py` (which generates its own conf block
  in-process instead) — also already called out as dead/orphaned in
  DURABILITY.md; not re-reported here as new.
- `PluginSettings.Load()` (SettingsForm.cs:222-233) returns
  `JsonConvert.DeserializeObject<PluginSettings>(json)` with no null-check;
  if `settings.json` ever contains literal `null` or is truncated to empty,
  this returns `null` and every caller (`ApiClient.LoadSettings`,
  `SettingsForm.LoadSettings`) dereferences it — but both call sites already
  wrap this in `try/catch` and fall back to defaults, so the failure mode is
  "silently reset to defaults," not a crash. Filed as low/no-action.

## Files read (full, line-by-line)

desktop/: launcher.py, backend_entry.py, updater.py, build.py, version.json,
feed.example.json, postgresql.conf.template, build_frontend.ps1,
fetch_postgres.ps1, launcher.spec, backend.spec, installer.iss, .secret_key,
.gitignore, DESKTOP_PACKAGING.md, DURABILITY.md (14 files; build_run*.log /
iscc_run.log / build_backend.log are build logs, not source, skimmed via
glob only, not read as source).

solidworks-plugin/: BlackboxBOM.SolidWorks.sln,
BlackboxBOM.SolidWorks/BlackboxBOM.SolidWorks.csproj,
BlackboxBomAddin.cs, ApiClient.cs, BomExtractor.cs, EventWatcher.cs,
BomPanel.cs, ImageExtractor.cs, ModelUpdater.cs, Models.cs, SettingsForm.cs,
SwAddinAttribute.cs (12 files).

Skipped: `.claude/worktrees/agent-*/solidworks-plugin/**` — three verified-
identical duplicate mirrors of the same plugin source (agent worktrees, not
part of the shipped repo); `desktop/build*`, `desktop/dist/` — build output,
excluded per instructions.

Total distinct source files read: 26.

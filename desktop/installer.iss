; ============================================================================
; Blackbox BOM - Inno Setup installer script
; ============================================================================
; Produces BlackboxBOM-Setup-{#AppVersion}.exe
;
; SHARED CONTRACT (must match desktop\version.json, launcher, backend bundle):
;   INSTALL_DIR = %ProgramFiles%\BlackboxBOM   (this script's {app})
;                 - launcher.exe
;                 - backend\            (frozen backend bundle; entrypoint app.main:app via uvicorn)
;                 - frontend\dist\      (built with `npm run build` in ..\frontend)
;                 - pgsql\              (portable Postgres 16 runtime; see fetch_postgres.ps1)
;   DATA_DIR    = %ProgramData%\BlackboxBOM    ({commonappdata}\BlackboxBOM)
;                 - pgdata\, .env, backups\, logs\, wal_archive\
;                 - PERSISTS across install/update/uninstall (removed only if the
;                   user explicitly opts in when uninstalling, see [Code] below).
;   BACKEND     : uvicorn app.main:app on 127.0.0.1:8756 (started by launcher.exe)
;
; Expected build layout relative to this script (desktop\), populated by the
; respective build steps BEFORE running `iscc installer.iss`:
;   desktop\build\launcher\*   <- launcher.exe (+ deps)            [launcher build task]
;   desktop\build\backend\*   <- frozen backend bundle             [backend-bundle task]
;   desktop\build\pgsql\*     <- portable Postgres runtime         [fetch_postgres.ps1]
;   ..\frontend\dist\*        <- `npm run build` output            [frontend build]
;
; AppVersion is driven from an ISPP define so a build script can keep it in
; sync with the single source of truth, desktop\version.json, e.g.:
;   $v = (Get-Content version.json | ConvertFrom-Json).version
;   iscc /DAppVersion=$v installer.iss
; If not overridden, it falls back to the value below (keep in sync manually).
;
; NOTE: iscc.exe (Inno Setup 6.x compiler) is required to actually build this
; script; it is not available in this sandbox. This file has been reviewed
; statically for correctness against the Inno Setup 6 language reference.
; ============================================================================

#ifndef AppVersion
  #define AppVersion "2.1.0"
#endif

#define MyAppName "Blackbox BOM"
#define MyAppPublisher "Blackbox Factories"
#define MyAppExeName "launcher.exe"
#define MyDataDirName "BlackboxBOM"

[Setup]
; Fixed, never-changing AppId (do NOT regenerate - it identifies upgrades).
AppId={{4C6F3C6A-2B7E-4C86-9C7B-1D6E4C3B2E17}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppVerName={#MyAppName} {#AppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoVersion={#AppVersion}

; Fixed install location per shared contract - do not let the user relocate it,
; since the launcher / backend bundle assume this exact path.
DefaultDirName={autopf}\BlackboxBOM
DisableDirPage=yes
UsePreviousAppDir=no
DirExistsWarning=no

DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes

OutputDir=build\Output
OutputBaseFilename=BlackboxBOM-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
LZMANumBlockThreads=4

; Postgres 16 EDB binaries are 64-bit only.
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

; Writing to Program Files + ProgramData ACLs + HKLM requires elevation.
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline

MinVersion=10.0
WizardStyle=modern
DisableWelcomePage=no
DisableReadyPage=no
DisableFinishedPage=no
SetupLogging=yes

UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}

; Best-effort: ask Windows Restart Manager to close the running app (launcher,
; uvicorn/python, postgres) before overwriting locked files. This matters for
; the /VERYSILENT update path where launcher.exe / postgres.exe may still be
; running from a previous session.
CloseApplications=yes
CloseApplicationsFilter=*.exe
RestartApplications=no

; Supports silent installs out of the box (Inno Setup native behavior):
;   BlackboxBOM-Setup-{#AppVersion}.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
; No custom wizard pages are added on the install side, so silent mode needs
; no special handling here.

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Dirs]
; DATA_DIR and its subfolders. Permissions grant the interactive (non-admin)
; user Modify rights so the app can read/write Postgres data, .env, backups,
; logs and WAL archives without re-elevating on every run.
; uninsneveruninstall: the uninstaller must never remove these on its own;
; removal (if any) is handled explicitly and only on user opt-in, see [Code].
Name: "{commonappdata}\{#MyDataDirName}"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\{#MyDataDirName}\pgdata"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\{#MyDataDirName}\backups"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\{#MyDataDirName}\logs"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\{#MyDataDirName}\wal_archive"; Permissions: users-modify; Flags: uninsneveruninstall

[Files]
; Launcher (single EXE + any side-by-side deps produced by the launcher build)
Source: "build\launcher\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

; Frozen backend bundle (entrypoint app.main:app, run by uvicorn from launcher)
Source: "build\backend\*"; DestDir: "{app}\backend"; Flags: recursesubdirs createallsubdirs ignoreversion

; Frontend production build (served by the backend via StaticFiles + SPA fallback)
Source: "..\frontend\dist\*"; DestDir: "{app}\frontend\dist"; Flags: recursesubdirs createallsubdirs ignoreversion

; Portable Postgres 16 runtime (bin + lib + share) - see fetch_postgres.ps1
Source: "build\pgsql\*"; DestDir: "{app}\pgsql"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKLM; Subkey: "Software\BlackboxBOM"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\BlackboxBOM"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"
Root: HKLM; Subkey: "Software\BlackboxBOM"; ValueType: string; ValueName: "DataDir"; ValueData: "{commonappdata}\{#MyDataDirName}"
Root: HKLM; Subkey: "Software\BlackboxBOM"; ValueType: string; ValueName: "Version"; ValueData: "{#AppVersion}"
Root: HKLM; Subkey: "Software\BlackboxBOM"; ValueType: string; ValueName: "BackendUrl"; ValueData: "http://127.0.0.1:8756"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: postinstall nowait skipifsilent

[Code]
{ ------------------------------------------------------------------------
  Uninstall-time data removal.

  Inno Setup's uninstaller does not support arbitrary custom wizard pages
  (CreateCustomPage/CreateInputOptionPage rely on the full Setup wizard form,
  which the uninstaller does not have). The documented, reliable way to offer
  an uninstall-time choice is a confirmation MsgBox from CurUninstallStepChanged,
  which is what this implements: an interactive Yes/No "task" to also delete
  DATA_DIR, defaulting to No (data preserved) exactly as specified by contract.

  For scripted/silent uninstalls (updater calling the old version's uninstaller,
  or /VERYSILENT), no MsgBox is shown; data is preserved unless the caller
  explicitly passes the /REMOVEDATA command-line switch.
------------------------------------------------------------------------- }
function ShouldRemoveData(): Boolean;
var
  I: Integer;
  Param: String;
  Response: Integer;
begin
  Result := False;

  { Explicit opt-in for scripted / silent uninstalls }
  I := 1;
  while True do
  begin
    Param := ParamStr(I);
    if Param = '' then
      Break;
    if CompareText(Param, '/REMOVEDATA') = 0 then
    begin
      Result := True;
      Exit;
    end;
    I := I + 1;
  end;

  { Interactive uninstall: ask the user; default remains "keep my data" }
  if not UninstallSilent() then
  begin
    Response := MsgBox(
      'Do you also want to permanently delete Blackbox BOM''s application data ' +
      '(database, backups, logs and configuration)?' + #13#10 + #13#10 +
      'Location: ' + ExpandConstant('{commonappdata}\{#MyDataDirName}') + #13#10 + #13#10 +
      'Choose No to keep your data - recommended if you plan to reinstall or ' +
      'upgrade Blackbox BOM later.',
      mbConfirmation, MB_YESNO);
    Result := (Response = IDYES);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if ShouldRemoveData() then
      DelTree(ExpandConstant('{commonappdata}\{#MyDataDirName}'), True, True, True);
  end;
end;

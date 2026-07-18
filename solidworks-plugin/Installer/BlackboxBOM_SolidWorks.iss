; Blackbox BOM SolidWorks Plugin Installer
; Inno Setup Script

#define MyAppName "Blackbox BOM SolidWorks Plugin"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Blackbox BOM"
#define MyAppURL "https://blackboxbom.com"
#define MyAppExeName "BlackboxBOM.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\BlackboxBOM\SolidWorks
DefaultGroupName={#MyAppName}
OutputDir=installer_output
OutputBaseFilename=BlackboxBOM_SolidWorks_Setup_{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.17763

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Plugin DLLs
Source: "BlackboxBOM.SolidWorks\bin\Release\BlackboxBOM.SolidWorks.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "BlackboxBOM.SolidWorks\bin\Release\BlackboxBOM.SolidWorks.pdb"; DestDir: "{app}"; Flags: ignoreversion
Source: "BlackboxBOM.SolidWorks\bin\Release\Newtonsoft.Json.dll"; DestDir: "{app}"; Flags: ignoreversion

; SolidWorks Interop DLLs (copied to bin\Release automatically since the .csproj
; references them with Private=true; names must match the actual assembly names)
Source: "BlackboxBOM.SolidWorks\bin\Release\SolidWorks.Interop.sldworks.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "BlackboxBOM.SolidWorks\bin\Release\SolidWorks.Interop.swconst.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "BlackboxBOM.SolidWorks\bin\Release\SolidWorks.Interop.swpublished.dll"; DestDir: "{app}"; Flags: ignoreversion

; Documentation
Source: "..\docs\SolidWorks_Integration_Guide.md"; DestDir: "{app}\Docs"; Flags: ignoreversion
Source: "..\docs\SolidWorks_Plugin_User_Manual.md"; DestDir: "{app}\Docs"; Flags: ignoreversion

[Registry]
; Register COM Add-in for SolidWorks
Root: HKLM; Subkey: "SOFTWARE\SolidWorks\Addins\{{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"; ValueType: dword; ValueName: ""; ValueData: 0; Flags: uninsdeletekey
Root: HKLM; Subkey: "SOFTWARE\SolidWorks\Addins\{{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"; ValueType: string; ValueName: "Description"; ValueData: "Blackbox BOM Management Integration"; Flags: uninsdeletekey
Root: HKLM; Subkey: "SOFTWARE\SolidWorks\Addins\{{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"; ValueType: string; ValueName: "Title"; ValueData: "Blackbox BOM"; Flags: uninsdeletekey

; Auto-load add-in at startup
Root: HKCU; Subkey: "Software\SolidWorks\AddInsStartup\{{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"; ValueType: dword; ValueName: ""; ValueData: 1; Flags: uninsdeletekey

; Store API settings
Root: HKCU; Subkey: "Software\BlackboxBOM"; ValueType: string; ValueName: "ApiUrl"; ValueData: "http://localhost:8000"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\BlackboxBOM"; ValueType: string; ValueName: "ApiKey"; ValueData: ""; Flags: uninsdeletekey

[Icons]
; NOTE: there is no standalone "Settings.exe" — Settings is a WinForms dialog
; (SettingsForm.cs) opened from *inside* SolidWorks via the add-in's "Settings"
; toolbar/menu command (OpenSettings()), not a separate executable. A Start Menu
; shortcut pointing at a nonexistent Settings.exe (as this used to) would be a
; dead/broken shortcut on every install — removed.
Name: "{group}\Documentation"; Filename: "{app}\Docs\SolidWorks_Integration_Guide.md"
Name: "{group}\Uninstall"; Filename: "{uninstallexe}"

[Run]
; Register the add-in for COM interop via RegAsm. NOTE: regsvr32 (used here
; previously) only works for native COM DLLs that export DllRegisterServer — a
; managed .NET assembly (even one built with RegisterForComInterop=true) has no
; such export, so regsvr32 against it silently no-ops (errors are swallowed by
; /s). RegAsm is the correct tool for .NET COM interop registration. The interop
; reference DLLs (SolidWorks.Interop.*) are plain reference assemblies, not COM
; servers, and must NOT be registered at all.
Filename: "{dotnet4064}\RegAsm.exe"; Parameters: "/codebase ""{app}\BlackboxBOM.SolidWorks.dll"""; Flags: runhidden

[UninstallRun]
Filename: "{dotnet4064}\RegAsm.exe"; Parameters: "/unregister ""{app}\BlackboxBOM.SolidWorks.dll"""; Flags: runhidden

[Code]
// Check if SolidWorks is installed
function IsSolidWorksInstalled: Boolean;
var
  ResultCode: Integer;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\SolidWorks\SOLIDWORKS');
end;

// Check SolidWorks version
function GetSolidWorksVersion: String;
var
  Version: String;
begin
  if RegQueryStringValue(HKLM, 'SOFTWARE\SolidWorks\SOLIDWORKS', 'Version', Version) then
    Result := Version
  else
    Result := 'Unknown';
end;

function InitializeSetup: Boolean;
begin
  if not IsSolidWorksInstalled then
  begin
    if MsgBox('SolidWorks is not detected on this system. The plugin requires SolidWorks 2018 or later.' + #13#10 + #13#10 + 'Do you want to continue anyway?', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
      Exit;
    end;
  end
  else
  begin
    MsgBox('SolidWorks detected: ' + GetSolidWorksVersion, mbInformation, MB_OK);
  end;
  
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Success message
    MsgBox('Installation completed successfully!' + #13#10 + #13#10 + 
           'To use the plugin:' + #13#10 +
           '1. Open SolidWorks' + #13#10 +
           '2. The plugin will load automatically' + #13#10 +
           '3. Configure API connection in Settings' + #13#10 + #13#10 +
           'See the documentation in the Docs folder for details.', mbInformation, MB_OK);
  end;
end;

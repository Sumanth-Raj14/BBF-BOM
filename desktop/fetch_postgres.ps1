<#
.SYNOPSIS
    Downloads the EnterpriseDB (EDB) Windows x64 "binaries" zip for PostgreSQL 16
    and extracts a minimal portable runtime (bin + lib + share) into
    desktop\build\pgsql, ready to be picked up by installer.iss's [Files] section
    (Source: "build\pgsql\*"  DestDir: "{app}\pgsql").

.DESCRIPTION
    This is NOT the interactive EDB installer - it is the plain zip distribution
    published at https://get.enterprisedb.com/postgresql/ , which ships a
    self-contained "portable" Postgres tree (no Windows service registration,
    no registry writes) suitable for bundling inside another application.

    The zip also contains pgAdmin 4, StackBuilder, an Uninstall.exe, docs, and
    C headers - none of which the bundled desktop app needs at runtime. Only
    bin\, lib\, and share\ are copied out.

.PARAMETER Version
    EDB package version string, e.g. "16.9-1". Must correspond to a real file
    at https://get.enterprisedb.com/postgresql/postgresql-<Version>-windows-x64-binaries.zip

.PARAMETER ExpectedMd5
    Pinned checksum for the exact zip named by -Version. Verified (case-insensitively)
    before any extraction happens; the script aborts loudly on mismatch. Defaults to
    the checksum for the pinned default -Version below.

    How this was obtained: EDB serves these zips from S3, and the objects carry an
    `x-amz-meta-s3cmd-attrs` response header containing the uploader's original
    md5:<hex> of the full file (this is NOT the S3 ETag, which is a multipart-upload
    hash and does NOT match the file's real MD5 for these particular objects).
    Reproduce with:
        curl.exe -sI "https://get.enterprisedb.com/postgresql/postgresql-<Version>-windows-x64-binaries.zip"
    and read the md5:<hex> field out of x-amz-meta-s3cmd-attrs. Treat that value as
    trusted vendor metadata, not as strong as a signed release checksum - if you need
    stronger assurance, download once, verify MD5 here, then independently record and
    pin a SHA256 of the same file for future re-runs.

.PARAMETER OutputDir
    Where the minimal runtime is placed. Defaults to desktop\build\pgsql (sibling
    of this script), matching installer.iss's expected Source path.

.PARAMETER Force
    Re-download / re-extract even if OutputDir already looks populated.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\fetch_postgres.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\fetch_postgres.ps1 -Version 16.4-1 -ExpectedMd5 e43b1d68d32f97ea0668b249c28959be
#>
[CmdletBinding()]
param(
    [string]$Version = "16.9-1",
    [string]$ExpectedMd5 = "ff183ee1a501ec4db28d106376622bc4",
    [string]$OutputDir = (Join-Path $PSScriptRoot "build\pgsql"),
    [switch]$Force
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step([string]$Message) {
    Write-Host "[fetch_postgres] $Message"
}

$zipFileName = "postgresql-$Version-windows-x64-binaries.zip"
$downloadUrl = "https://get.enterprisedb.com/postgresql/$zipFileName"

if ((Test-Path $OutputDir) -and -not $Force) {
    $existingExe = Get-ChildItem -Path $OutputDir -Filter "postgres.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $existingExe) {
        Write-Step "Already populated: $OutputDir (found $($existingExe.FullName)). Use -Force to re-fetch."
        exit 0
    }
}

$workDir = Join-Path $env:TEMP ("blackboxbom-pg-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
$zipPath = Join-Path $workDir $zipFileName

try {
    Write-Step "Downloading $downloadUrl"
    Write-Step "(this is a ~300 MB file; it may take a while)"
    $ProgressPreference = "SilentlyContinue" # dramatically speeds up Invoke-WebRequest
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

    Write-Step "Verifying MD5 checksum..."
    $actualMd5 = (Get-FileHash -Path $zipPath -Algorithm MD5).Hash
    if ($actualMd5.ToLowerInvariant() -ne $ExpectedMd5.ToLowerInvariant()) {
        throw ("Checksum mismatch for {0}:`n  expected: {1}`n  actual:   {2}`n" -f `
            $zipFileName, $ExpectedMd5.ToLowerInvariant(), $actualMd5.ToLowerInvariant()) + `
            "Refusing to extract an unverified archive. If EDB has published a new " + `
            "build under the same version string, re-derive and update -ExpectedMd5 " + `
            "(see script header) before re-running."
    }
    Write-Step "Checksum OK ($actualMd5)"

    $extractDir = Join-Path $workDir "extracted"
    Write-Step "Extracting archive..."
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    # The EDB zip normally wraps everything in a single top-level "pgsql" folder,
    # but locate it defensively by finding postgres.exe rather than assuming the
    # exact layout, in case EDB changes it in a future release.
    $postgresExe = Get-ChildItem -Path $extractDir -Filter "postgres.exe" -Recurse | Select-Object -First 1
    if ($null -eq $postgresExe) {
        throw "Could not locate postgres.exe anywhere inside the extracted archive - unexpected package layout."
    }
    $pgRoot = $postgresExe.Directory.Parent.FullName # .../<pgRoot>/bin/postgres.exe -> <pgRoot>
    Write-Step "Detected Postgres runtime root: $pgRoot"

    if (Test-Path $OutputDir) {
        Write-Step "Removing existing $OutputDir"
        Remove-Item -Path $OutputDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    # Minimal runtime needed to run initdb/pg_ctl/postgres: bin, lib, share.
    # Deliberately excluded: pgAdmin 4, StackBuilder, doc, include (headers,
    # only needed to build extensions from source), symbols, installer/uninstaller.
    $keep = @("bin", "lib", "share")
    foreach ($dirName in $keep) {
        $src = Join-Path $pgRoot $dirName
        if (Test-Path $src) {
            Write-Step "Copying $dirName\ ..."
            Copy-Item -Path $src -Destination (Join-Path $OutputDir $dirName) -Recurse -Force
        } else {
            Write-Warning "Expected subfolder '$dirName' not found under $pgRoot - skipping."
        }
    }

    $finalExe = Get-ChildItem -Path $OutputDir -Filter "postgres.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $finalExe) {
        throw "Post-copy sanity check failed: postgres.exe not found under $OutputDir"
    }

    Write-Step "Done. Portable Postgres $Version staged at: $OutputDir"
    Write-Step "installer.iss expects exactly this path (build\pgsql) relative to desktop\."
}
finally {
    Write-Step "Cleaning up temp files..."
    Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue
}

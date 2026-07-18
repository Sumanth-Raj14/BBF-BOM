#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the Blackbox BOM frontend for bundling into the desktop app.

.DESCRIPTION
    Runs `npm ci && npm run build` in frontend/, producing frontend/dist
    (via Vite). That dist directory is what the launcher/installer copies to
    INSTALL_DIR\frontend, and what backend/app/main.py serves (guarded, via
    StaticFiles + SPA fallback) when FRONTEND_DIST_DIR points at it or a
    dist directory is present.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\build_frontend.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$DesktopDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $DesktopDir
$FrontendDir = Join-Path $RepoRoot "frontend"

if (-not (Test-Path $FrontendDir)) {
    throw "Frontend directory not found: $FrontendDir"
}

Write-Host "==> Building frontend in $FrontendDir" -ForegroundColor Cyan

Push-Location $FrontendDir
try {
    Write-Host "==> npm ci" -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed with exit code $LASTEXITCODE"
    }

    Write-Host "==> npm run build" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$DistDir = Join-Path $FrontendDir "dist"
if (-not (Test-Path $DistDir)) {
    throw "Build finished but dist directory was not created: $DistDir"
}

$IndexHtml = Join-Path $DistDir "index.html"
if (-not (Test-Path $IndexHtml)) {
    throw "Build finished but index.html is missing from dist: $IndexHtml"
}

Write-Host "==> Frontend build complete: $DistDir" -ForegroundColor Green

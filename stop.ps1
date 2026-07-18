# Stop Blackbox BOM without losing any data.
#
# Stops and removes the running containers but leaves the named Docker
# volumes (pgdata, backend_uploads, rsa_keys, etc.) untouched, so your
# database and files are exactly as you left them next time you run
# .\install.ps1 (or `docker compose up -d`).
#
# Usage:
#   .\stop.ps1
#
# Non-behavioral deployment glue -- does not touch application code.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Stopping Blackbox BOM (data is preserved)..."
docker compose down
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose down failed -- see the output above."
    exit 1
}
Write-Host "Stopped. Your data is untouched -- run .\install.ps1 to start it again."

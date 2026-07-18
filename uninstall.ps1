# Fully remove Blackbox BOM's containers, images, and (optionally) DATA from
# this PC.
#
# By default this is the "safe" uninstall: it removes containers/networks
# and the built app images, but leaves your data volumes (database, uploaded
# files, RSA keys) in place, in case you change your mind.
#
# Pass -Purge to ALSO permanently delete the data volumes -- use this when
# you are done with a machine for good (e.g. after you've already moved your
# data to a new PC with scripts\backup-data.ps1 and confirmed it restored
# correctly there).
#
# Usage:
#   .\uninstall.ps1            # remove containers/images, keep data
#   .\uninstall.ps1 -Purge     # also permanently delete all data (asks first)
#
# Non-behavioral deployment glue -- does not touch application code.
param(
    [switch]$Purge
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if ($Purge) {
    Write-Host "WARNING: -Purge will PERMANENTLY DELETE the database, uploaded" -ForegroundColor Yellow
    Write-Host "files, and RSA signing keys stored in this stack's Docker volumes." -ForegroundColor Yellow
    Write-Host "This cannot be undone unless you have a backup (scripts\backup-data.ps1)." -ForegroundColor Yellow
    $answer = Read-Host "Type YES (all caps) to confirm permanent data deletion"
    if ($answer -ne "YES") {
        Write-Host "Aborted -- no changes made."
        exit 0
    }
    Write-Host "Removing containers, networks, images, AND data volumes..."
    docker compose down --volumes --rmi local
} else {
    Write-Host "Removing containers, networks, and images (data volumes are kept)..."
    docker compose down --rmi local
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose down failed -- see the output above."
    exit 1
}

if ($Purge) {
    Write-Host "Uninstalled. All data has been deleted."
} else {
    Write-Host "Uninstalled. Your data volumes are still on disk -- run 'docker volume ls'"
    Write-Host "to see them, or re-run .\install.ps1 later to pick up right where you left off."
    Write-Host "To also delete the data, run: .\uninstall.ps1 -Purge"
}

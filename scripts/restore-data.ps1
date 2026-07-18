# Load a backup produced by scripts\backup-data.ps1 (Postgres database +
# uploaded files + RSA signing keys) into a running local-first stack -- the
# other half of "move existing data to a new PC" (see README).
#
# Run this AFTER a fresh `docker compose up --build -d` has already created
# the (empty, migrated) stack on the new machine. (Bash/Git-Bash users:
# scripts/restore-data.sh does the same thing.)
#
# Usage:
#   .\scripts\restore-data.ps1 backups\20260718-120000
#
# WARNING: this REPLACES the current database contents, uploaded files, and
# RSA signing keys. Only run it right after a fresh install you intend to
# populate from the backup.
#
# Non-behavioral deployment glue -- does not touch application code.
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFolder
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path $BackupFolder -PathType Container)) {
    Write-Error "Backup folder not found: $BackupFolder"
    exit 1
}
foreach ($f in @("db.dump", "uploads.tar.gz", "rsa_keys.tar.gz")) {
    if (-not (Test-Path (Join-Path $BackupFolder $f))) {
        Write-Error "$BackupFolder\$f not found -- is this a folder produced by backup-data.ps1?"
        exit 1
    }
}

$envVars = @{}
if (Test-Path ".env") {
    foreach ($line in Get-Content ".env") {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $envVars[$matches[1]] = $matches[2]
        }
    }
}
function Get-EnvOrDefault([string]$name, [string]$default) {
    if ($envVars.ContainsKey($name) -and $envVars[$name]) { return $envVars[$name] }
    return $default
}
$pgUser = Get-EnvOrDefault "POSTGRES_USER" "bom_user"
$pgDb   = Get-EnvOrDefault "POSTGRES_DB" "bom_db"
$pgPass = Get-EnvOrDefault "POSTGRES_PASSWORD" ""

if (-not (docker compose ps -q db) -or -not (docker compose ps -q backend)) {
    Write-Error "The stack isn't up. Run 'docker compose up --build -d' first, then retry."
    exit 1
}

Write-Host "[restore] restoring Postgres database '$pgDb' from $BackupFolder\db.dump..."
docker compose cp (Join-Path $BackupFolder "db.dump") db:/tmp/ws6-restore.dump
docker compose exec -T -e "PGPASSWORD=$pgPass" db `
    pg_restore -U $pgUser -d $pgDb --clean --if-exists --no-owner /tmp/ws6-restore.dump
docker compose exec -T db rm -f /tmp/ws6-restore.dump

Write-Host "[restore] restoring uploaded files..."
docker compose cp (Join-Path $BackupFolder "uploads.tar.gz") backend:/tmp/ws6-uploads.tar.gz
docker compose exec -T backend sh -c "rm -rf /app/uploads/* && tar xzf /tmp/ws6-uploads.tar.gz -C /app/uploads && rm -f /tmp/ws6-uploads.tar.gz"

Write-Host "[restore] restoring RSA signing keys..."
docker compose cp (Join-Path $BackupFolder "rsa_keys.tar.gz") backend:/tmp/ws6-rsa_keys.tar.gz
docker compose exec -T backend sh -c "rm -rf /rsa_keys/* && tar xzf /tmp/ws6-rsa_keys.tar.gz -C /rsa_keys && rm -f /tmp/ws6-rsa_keys.tar.gz"

Write-Host "[restore] restarting backend so it picks up the restored RSA keys..."
docker compose restart backend

Write-Host "[restore] done. Open http://localhost and sign in with your existing account(s)."

# Export the running local-first stack's DATA (Postgres database + uploaded
# files + RSA signing keys) to a timestamped folder under .\backups, so it
# can be copied to a NEW PC and loaded there with scripts\restore-data.ps1.
#
# This is the "move existing data to a new machine" story. For a fresh,
# empty install on a new machine, `docker compose up --build` alone is
# enough (see README) -- this script is only needed when you want to bring
# your existing data with you. (Bash/Git-Bash users: scripts/backup-data.sh
# does the same thing.)
#
# Usage:
#   docker compose up -d          # stack must already be running
#   .\scripts\backup-data.ps1
#
# Non-behavioral deployment glue -- does not touch application code.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

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
    Write-Error "The stack isn't up. Run 'docker compose up -d' first, then retry."
    exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path "backups" $stamp
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Host "[backup] dumping Postgres database '$pgDb'..."
docker compose exec -T -e "PGPASSWORD=$pgPass" db `
    pg_dump -U $pgUser -d $pgDb -Fc -f /tmp/ws6-backup.dump
docker compose cp db:/tmp/ws6-backup.dump (Join-Path $out "db.dump")
docker compose exec -T db rm -f /tmp/ws6-backup.dump

Write-Host "[backup] archiving uploaded files (backend_uploads volume)..."
docker compose exec -T backend tar czf /tmp/ws6-uploads.tar.gz -C /app/uploads .
docker compose cp backend:/tmp/ws6-uploads.tar.gz (Join-Path $out "uploads.tar.gz")
docker compose exec -T backend rm -f /tmp/ws6-uploads.tar.gz

Write-Host "[backup] archiving RSA signing keys (rsa_keys volume)..."
docker compose exec -T backend tar czf /tmp/ws6-rsa_keys.tar.gz -C /rsa_keys .
docker compose cp backend:/tmp/ws6-rsa_keys.tar.gz (Join-Path $out "rsa_keys.tar.gz")
docker compose exec -T backend rm -f /tmp/ws6-rsa_keys.tar.gz

Write-Host "[backup] done -> $out\"
Write-Host ""
Write-Host "To move to a new PC: copy the repo + your .env + this '$out' folder"
Write-Host "there, install Docker, run 'docker compose up --build -d', then:"
Write-Host "  .\scripts\restore-data.ps1 $out"

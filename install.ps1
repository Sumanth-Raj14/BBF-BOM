# Blackbox BOM -- one-click local install/update (Windows)
#
# What this does, in order:
#   1. Checks Docker Desktop is installed and running (offers a `winget`
#      install if it's missing, since Docker Desktop cannot be silently
#      auto-installed by a script -- it needs the interactive installer once).
#   2. Copies .env.example -> .env on first run only, generating strong
#      random secrets for you (never overwrites an existing .env).
#   3. Runs `docker compose up -d --build` -- this builds the images (first
#      run only, cached afterwards), applies database migrations, and starts
#      Postgres + Redis + backend + frontend, entirely on this machine.
#   4. Waits for the backend's health check to go healthy.
#   5. Opens the app in your default browser.
#
# Safe to re-run any time (e.g. after `git pull`) to rebuild and restart with
# the latest code -- it never touches your existing data or overwrites .env.
#
# Usage:
#   .\install.ps1
#   .\install.ps1 -SkipBrowser      # don't auto-open the browser
#
# Non-behavioral deployment glue -- does not touch application code.

param(
    [switch]$SkipBrowser
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# -- 1. Docker Desktop present & running? --------------------------------
Write-Step "Checking for Docker Desktop..."

$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Write-Warn "Docker was not found on this PC."
    Write-Host ""
    Write-Host "    Blackbox BOM runs inside Docker Desktop, which packages every"
    Write-Host "    dependency (Python, Node, PostgreSQL, Redis) so you don't have"
    Write-Host "    to install any of them by hand."
    Write-Host ""
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        $answer = Read-Host "    Install Docker Desktop now via winget? (y/N)"
        if ($answer -match '^(y|yes)$') {
            Write-Step "Installing Docker Desktop via winget (this opens its own installer)..."
            winget install -e --id Docker.DockerDesktop
            Write-Warn "Docker Desktop was installed. It needs to finish starting up and"
            Write-Warn "you may need to sign out/in or reboot once. Re-run .\install.ps1"
            Write-Warn "after Docker Desktop's whale icon in the system tray is steady (not animating)."
            exit 0
        }
    }
    Write-Host "    Download and install Docker Desktop manually from:"
    Write-Host "        https://www.docker.com/products/docker-desktop/"
    Write-Host "    Then re-run this script: .\install.ps1"
    exit 1
}
Write-Ok "docker CLI found: $($dockerCmd.Source)"

# `docker info` fails fast if the Docker Desktop engine isn't running yet.
$dockerRunning = $false
try {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
} catch { $dockerRunning = $false }

if (-not $dockerRunning) {
    Write-Warn "Docker Desktop is installed but not running."
    $dockerDesktopExe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktopExe) {
        Write-Step "Starting Docker Desktop..."
        Start-Process $dockerDesktopExe
    } else {
        Write-Warn "Please start Docker Desktop from the Start Menu."
    }
    Write-Host "    Waiting for the Docker engine to come up (up to 2 minutes)..."
    $waited = 0
    while ($waited -lt 120) {
        Start-Sleep -Seconds 3
        $waited += 3
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { $dockerRunning = $true; break }
        Write-Host "." -NoNewline
    }
    Write-Host ""
    if (-not $dockerRunning) {
        Write-Error "Docker Desktop did not become ready in time. Start it manually, wait until the whale icon in the system tray is steady, then re-run .\install.ps1."
        exit 1
    }
}
Write-Ok "Docker engine is running."

# -- 2. .env -- copy from template + generate secrets (first run only) ---
Write-Step "Checking .env configuration..."

function New-Secret {
    # 32 bytes of crypto-random data, base64url-encoded (no python dependency
    # required on the host -- everything else runs inside containers).
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

if (-not (Test-Path ".env")) {
    if (-not (Test-Path ".env.example")) {
        Write-Error ".env.example not found -- cannot create .env. Run this script from the repo root."
        exit 1
    }
    Write-Host "    No .env found -- creating one from .env.example with freshly generated secrets."
    $content = Get-Content ".env.example" -Raw

    $secrets = @{
        "POSTGRES_PASSWORD" = New-Secret
        "REDIS_PASSWORD"    = New-Secret
        "SECRET_KEY"        = New-Secret
        "ENCRYPTION_KEY"    = New-Secret
        "S3_SECRET_KEY"     = New-Secret
    }
    foreach ($key in $secrets.Keys) {
        # Replace "KEY=...placeholder..." (any value up to end of line) with a
        # freshly generated one, whatever placeholder text .env.example ships with.
        $content = $content -replace "(?m)^$key=.*$", "$key=$($secrets[$key])"
    }
    Set-Content -Path ".env" -Value $content -NoNewline
    Write-Ok "Created .env with unique, randomly generated secrets."
    Write-Warn "Back this file up somewhere safe (e.g. a password manager) -- losing it"
    Write-Warn "means losing access to encrypted data and signed sessions."
} else {
    Write-Ok ".env already exists -- leaving it untouched."
}

# -- 3. Bring the stack up -----------------------------------------------
Write-Step "Building and starting the stack (docker compose up -d --build)..."
Write-Host "    First run downloads base images and builds the app -- this can take"
Write-Host "    several minutes. Subsequent runs are much faster (cached)."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose up failed -- see the output above for details."
    exit 1
}

# -- 4. Wait for the backend health check --------------------------------
Write-Step "Waiting for the app to become healthy..."
$healthy = $false
$maxWaitSeconds = 180
$waited = 0
while ($waited -lt $maxWaitSeconds) {
    # Try the JSON format first (newer Compose v2); fall back to plain text
    # ("Up 5 minutes (healthy)") for older Compose versions that don't
    # support --format json on `ps`.
    $status = docker compose ps --format json backend 2>$null
    if (-not $status) { $status = docker compose ps backend 2>$null }
    if ($status -match '(?i)healthy') {
        $healthy = $true
        break
    }
    Start-Sleep -Seconds 3
    $waited += 3
    Write-Host "." -NoNewline
}
Write-Host ""

if (-not $healthy) {
    Write-Warn "The backend hasn't reported healthy yet after ${maxWaitSeconds}s."
    Write-Warn "It may still be finishing migrations on a first-time build -- check with:"
    Write-Warn "    docker compose logs -f backend"
    Write-Warn "The app may still work once it finishes; opening it now anyway."
} else {
    Write-Ok "Backend is healthy."
}

# -- 5. Open the browser -------------------------------------------------
$frontendPort = "80"
if (Test-Path ".env") {
    $envLine = (Get-Content ".env" | Where-Object { $_ -match '^FRONTEND_PORT=' } | Select-Object -Last 1)
    if ($envLine -match '^FRONTEND_PORT=(\d+)') { $frontendPort = $matches[1] }
}
$url = if ($frontendPort -eq "80") { "http://localhost" } else { "http://localhost:$frontendPort" }

Write-Step "Done."
Write-Ok "Blackbox BOM is running at $url"
if (-not $SkipBrowser) {
    Start-Process $url
}
Write-Host ""
Write-Host "    No account yet? Use the Register/Sign-up screen on first visit to"
Write-Host "    create the first (admin) account -- there is no default password."
Write-Host ""
Write-Host "    Useful next steps:"
Write-Host "      .\stop.ps1                  # stop the app (keeps all data)"
Write-Host "      .\scripts\backup-data.ps1   # back up your data before moving PCs"
Write-Host "      docker compose logs -f      # view live logs"
Write-Host "    See INSTALL.md for the full guide."

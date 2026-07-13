# Deploy cloud-node to Infomaniak (Windows). Mirrors scripts/deploy-cloud-api.sh.
# Requires PuTTY plink/pscp on PATH and cloud-node/.env.deploy.
#
# Usage:
#   .\scripts\deploy-cloud-api.ps1

param(
    [switch]$SkipRemoteNpm
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $Root "cloud-node"
$EnvFile = Join-Path $ApiDir ".env.deploy"

if (-not (Test-Path $EnvFile)) {
    throw "Missing $EnvFile - copy cloud-node/.env.deploy.example"
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
}

if (-not $env:SSH_USER -or -not $env:SSH_HOST) {
    throw "SSH_USER and SSH_HOST required in .env.deploy"
}

$RemotePath = if ($env:REMOTE_PATH) { $env:REMOTE_PATH.TrimStart("./") } else { "sites/api.exosites.ch" }
$Target = "$($env:SSH_USER)@$($env:SSH_HOST)"
$Plink = (Get-Command plink -ErrorAction SilentlyContinue).Source
$Pscp = (Get-Command pscp -ErrorAction SilentlyContinue).Source

if (-not $Plink -or -not $Pscp) {
    throw "PuTTY plink/pscp not found on PATH"
}

$HostKey = "SHA256:fKVOZJvOwD5z4tE3NEVtc49O54P0BuHVGmtgAyyz/UU"
$Pw = $env:SSH_PASSWORD
if (-not $Pw) {
    throw "SSH_PASSWORD required in .env.deploy for Windows deploy"
}

Write-Host "Deploying cloud-node -> ${Target}:${RemotePath}" -ForegroundColor Green

Push-Location $ApiDir
npm install --omit=dev | Out-Host

$Archive = Join-Path $env:TEMP "cloud-node-deploy.tgz"
if (Test-Path $Archive) { Remove-Item $Archive -Force }

& tar -czf $Archive `
    --exclude=node_modules `
    --exclude=.env `
    --exclude=.env.deploy `
    --exclude=server.log `
    -C $ApiDir .

Pop-Location

& $Pscp -batch -hostkey $HostKey -pw $Pw $Archive "${Target}:${RemotePath}/cloud-node-deploy.tgz"

$migrations = @(
    "node scripts/apply-migration-001.js",
    "node scripts/apply-migration-002.js",
    "node scripts/apply-migration-003.js",
    "node scripts/apply-migration-004.js",
    "node scripts/apply-migration-005.js",
    "node scripts/apply-migration-006.js",
    "node scripts/apply-migration-007.js",
    "node scripts/apply-migration-008.js",
    "node scripts/apply-migration-009.js",
    "node scripts/apply-migration-010.js",
    "node scripts/apply-migration-011.js",
    "node scripts/apply-migration-012.js",
    "node scripts/apply-migration-013.js",
    "node scripts/apply-migration-014.js",
    "node scripts/apply-migration-021.js"
)

$RemoteLines = @(
    "set -e",
    "cd $RemotePath",
    "tar -xzf cloud-node-deploy.tgz",
    "rm -f cloud-node-deploy.tgz"
) + $migrations

if (-not $SkipRemoteNpm) {
    $RemoteLines += @(
        "npm install --omit=dev",
        "pkill -f 'node server.js' 2>/dev/null; true"
    )
}

$RemoteScript = ($RemoteLines -join "`n")
& $Plink -batch -hostkey $HostKey -pw $Pw $Target $RemoteScript

Remove-Item $Archive -Force -ErrorAction SilentlyContinue

Write-Host "Done. Restart Node.js in Infomaniak Manager if the process did not reload." -ForegroundColor Green

if ($env:VERIFY_AFTER_DEPLOY -eq "1") {
    $bash = "C:\Program Files\Git\bin\bash.exe"
    if (Test-Path $bash) {
        & $bash (Join-Path $Root "scripts/verify-cloud-auth-api.sh")
    }
}

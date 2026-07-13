# Sync infra/llm to staging VPS and enable Redis sort queue.
#
# Usage (PowerShell):
#   $env:VPS_SSH = "ubuntu@YOUR_LLM_VPS_IPV4"
#   $env:VPS_SSH_KEY = "C:\path\to\vps_ssh_key"
#   .\scripts\deploy-sort-queue-staging.ps1
param(
    [string]$VpsSsh = $env:VPS_SSH,
    [string]$VpsSshKey = $env:VPS_SSH_KEY
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $VpsSsh) {
    throw "Set VPS_SSH (e.g. ubuntu@YOUR_LLM_VPS_IPV4) or pass -VpsSsh."
}

if (-not $VpsSshKey -or -not (Test-Path $VpsSshKey)) {
    throw "Missing VPS SSH key. Set VPS_SSH_KEY to your private key path."
}

$SshArgs = @("-i", $VpsSshKey, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15")
$InfraLlm = Join-Path $Root "infra\llm"

Write-Host "==> Syncing infra/llm to ${VpsSsh}:~/exo-llm/"
& ssh @SshArgs $VpsSsh "mkdir -p ~/exo-llm"

$rsync = Get-Command rsync -ErrorAction SilentlyContinue
if ($null -ne $rsync) {
    $rsyncSsh = 'ssh -i "' + $VpsSshKey + '" -o StrictHostKeyChecking=accept-new'
    $rsyncArgs = @(
        "-avz", "--delete",
        "--exclude", ".env",
        "--exclude", "compose/.env",
        "-e", $rsyncSsh,
        ($InfraLlm + "/"),
        ($VpsSsh + ":~/exo-llm/")
    )
    & rsync @rsyncArgs
} else {
    Write-Host "    rsync not found - using scp (slower)"
    & scp @SshArgs -r ($InfraLlm + "\*") ($VpsSsh + ":~/exo-llm/")
}

Write-Host "==> Enabling sort queue on VPS..."
$remoteCmd = @(
    "sed -i 's/\r$//' ~/exo-llm/scripts/*.sh ~/exo-llm/scripts/lib/*.sh",
    "cd ~/exo-llm",
    "chmod +x scripts/*.sh",
    "./scripts/enable-sort-queue-staging.sh"
) -join " && "
& ssh @SshArgs $VpsSsh $remoteCmd

Write-Host "==> Done. Run queue baseline:"
Write-Host '    $env:USE_SORT_QUEUE=''1''; python scripts\ga-sort-capacity-baseline.py'

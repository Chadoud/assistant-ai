# Sync prometheus overlay to staging VPS and enable scraping.
#
# Usage (PowerShell):
#   $env:VPS_SSH = "ubuntu@YOUR_LLM_VPS_IPV4"
#   $env:VPS_SSH_KEY = "C:\path\to\vps_ssh_key"
#   .\scripts\ga-enable-prometheus-vps.ps1
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
    throw "Missing VPS SSH key. Set VPS_SSH_KEY."
}

$SshArgs = @("-i", $VpsSshKey, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15")
$ScpArgs = @("-i", $VpsSshKey, "-o", "StrictHostKeyChecking=accept-new")
$InfraLlm = Join-Path $Root "infra\llm"

Write-Host "==> Uploading Prometheus overlay to ${VpsSsh}"
& ssh @SshArgs $VpsSsh "mkdir -p ~/exo-llm/compose ~/exo-llm/scripts/lib ~/exo-llm/prometheus"
& scp @ScpArgs (Join-Path $InfraLlm "compose\docker-compose.prometheus-overlay.yml") "${VpsSsh}:~/exo-llm/compose/"
& scp @ScpArgs (Join-Path $InfraLlm "scripts\enable-prometheus-staging.sh") "${VpsSsh}:~/exo-llm/scripts/"
& scp @ScpArgs (Join-Path $InfraLlm "scripts\lib\compose-stack.sh") "${VpsSsh}:~/exo-llm/scripts/lib/"
& scp @ScpArgs (Join-Path $InfraLlm "prometheus\prometheus.yml") "${VpsSsh}:~/exo-llm/prometheus/"
& scp @ScpArgs (Join-Path $InfraLlm "prometheus\alerts.yml") "${VpsSsh}:~/exo-llm/prometheus/"

$remoteCmd = "sed -i 's/\r$//' ~/exo-llm/scripts/*.sh ~/exo-llm/scripts/lib/*.sh 2>/dev/null; cd ~/exo-llm && chmod +x scripts/enable-prometheus-staging.sh && ./scripts/enable-prometheus-staging.sh"
& ssh @SshArgs $VpsSsh $remoteCmd

Write-Host "==> Done. Verify: npm run ga:beta-health -- --ssh-check-prometheus"

#!/usr/bin/env bash
# Infomaniak VPS: root disk ~20GB, bulk storage at /mnt/data (250GB).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SWAP_GB="${SWAP_GB:-4}"

"$ROOT/scripts/install-host.sh"

if ! mountpoint -q /mnt/data; then
  echo "ERROR: /mnt/data not mounted — Infomaniak data volume missing?"
  exit 1
fi

sudo mkdir -p /mnt/data/docker /mnt/data/ollama
sudo chown "$USER:$USER" /mnt/data/ollama

if [ ! -f /etc/docker/daemon.json ] || ! grep -q '/mnt/data/docker' /etc/docker/daemon.json 2>/dev/null; then
  if [ -d /var/lib/docker ] && [ "$(sudo ls -A /var/lib/docker 2>/dev/null | wc -l)" -gt 0 ]; then
    echo "==> Migrating Docker data to /mnt/data/docker..."
    sudo systemctl stop docker docker.socket
    sudo rsync -a /var/lib/docker/ /mnt/data/docker/
    sudo rm -rf /var/lib/docker/*
  fi
  echo '{"data-root": "/mnt/data/docker"}' | sudo tee /etc/docker/daemon.json
  sudo systemctl start docker
fi

echo "==> Infomaniak layout ready: Docker + Ollama models on /mnt/data"
"$ROOT/scripts/migrate-containerd-to-data.sh"
df -h / /mnt/data

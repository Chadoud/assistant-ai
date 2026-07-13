#!/usr/bin/env bash
# Move containerd root off the 20GB system disk onto Infomaniak /mnt/data.
set -euo pipefail

DATA_ROOT="/mnt/data/containerd"

if ! mountpoint -q /mnt/data; then
  echo "ERROR: /mnt/data not mounted"
  exit 1
fi

sudo mkdir -p "$DATA_ROOT"

if [ ! -f /etc/containerd/config.toml ] || ! grep -q "$DATA_ROOT" /etc/containerd/config.toml 2>/dev/null; then
  echo "==> Stopping Docker..."
  sudo systemctl stop docker docker.socket containerd 2>/dev/null || true

  if [ -d /var/lib/containerd ] && [ "$(sudo ls -A /var/lib/containerd 2>/dev/null | wc -l)" -gt 0 ]; then
    echo "==> Migrating containerd data..."
    sudo rsync -a /var/lib/containerd/ "$DATA_ROOT/"
    sudo rm -rf /var/lib/containerd/*
  fi

  sudo mkdir -p /etc/containerd
  if [ ! -f /etc/containerd/config.toml ]; then
    sudo containerd config default | sudo tee /etc/containerd/config.toml >/dev/null
  fi
  if grep -q '^#root = "/var/lib/containerd"' /etc/containerd/config.toml; then
    sudo sed -i "s|^#root = \"/var/lib/containerd\"|root = \"$DATA_ROOT\"|" /etc/containerd/config.toml
  elif ! grep -q "^root = " /etc/containerd/config.toml; then
    echo "root = \"$DATA_ROOT\"" | sudo tee -a /etc/containerd/config.toml >/dev/null
  else
    sudo sed -i "s|^root = .*|root = \"$DATA_ROOT\"|" /etc/containerd/config.toml
  fi

  echo "==> Starting containerd + Docker..."
  sudo systemctl start containerd docker
fi

# Docker may still reference /var/lib/containerd — symlink to data volume when safe.
if [ ! -L /var/lib/containerd ] && [ -d /mnt/data/containerd ]; then
  if [ "$(sudo ls -A /var/lib/containerd 2>/dev/null | wc -l)" -eq 0 ]; then
    sudo rmdir /var/lib/containerd 2>/dev/null || sudo rm -rf /var/lib/containerd
    sudo ln -s /mnt/data/containerd /var/lib/containerd
  fi
fi

if [ ! -L /var/lib/docker ] && [ -d /mnt/data/docker ]; then
  sudo systemctl stop docker docker.socket 2>/dev/null || true
  sudo rsync -a /var/lib/docker/ /mnt/data/docker/ 2>/dev/null || true
  sudo rm -rf /var/lib/docker
  sudo ln -s /mnt/data/docker /var/lib/docker
  sudo systemctl start docker 2>/dev/null || true
fi

sudo du -sh /var/lib/containerd /var/lib/docker "$DATA_ROOT" /mnt/data/docker 2>/dev/null || true
df -h / /mnt/data

#!/usr/bin/env bash
# Keep hot models loaded on CPU staging (every 15 minutes).
set -euo pipefail
(crontab -l 2>/dev/null | grep -v 'exo-llm/warmup' || true
 echo "*/15 * * * * cd $HOME/exo-llm && OLLAMA_CONTAINER=ollama ./scripts/warmup.sh >>/tmp/exo-llm-warmup.log 2>&1") | crontab -
echo "Installed warmup cron"

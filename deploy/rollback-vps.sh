#!/usr/bin/env bash
set -Eeuo pipefail

root=${PORCUPINE_ROOT:-/opt/porcupine-directory}
release_id=${1:?release id is required}

if [[ ! $release_id =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release id must be a full Git commit SHA." >&2
  exit 1
fi

release_dir="$root/releases/$release_id"
test -d "$release_dir"
ln -sfn "$release_dir" "$root/current"

PORCUPINE_ROOT="$root/current" \
PORCUPINE_ENV_FILE="$root/.env.production" \
  "$root/current/deploy/deploy-vps.sh"

#!/usr/bin/env bash
set -Eeuo pipefail

username=${1:?username is required}
if [[ ! $username =~ ^[^[:space:]]{3,32}$ ]]; then
  echo "Invalid username" >&2
  exit 1
fi

root=${PORCUPINE_ROOT:-/opt/porcupine-directory}
compose=(
  docker compose
  --env-file "$root/.env.production"
  -f "$root/current/compose.yaml"
  -f "$root/current/compose.production.yaml"
)

cd "$root/current"
"${compose[@]}" exec -T app node dist-server/server/admin-cli.js "$username"

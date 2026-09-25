#!/usr/bin/env bash
set -Eeuo pipefail

root=${PORCUPINE_ROOT:-/opt/porcupine-directory/current}
env_file=${PORCUPINE_ENV_FILE:-/opt/porcupine-directory/.env.production}
donation_env_file=${PORCUPINE_DONATION_ENV_FILE:-/opt/porcupine-directory/.donation.env}
backup_root=${PORCUPINE_BACKUP_ROOT:-/opt/porcupine-directory/backups}

test -d "$root"
test -f "$env_file"
test -f "$root/compose.yaml"
test -f "$root/compose.production.yaml"

compose=(docker compose --env-file "$env_file" -f "$root/compose.yaml" -f "$root/compose.production.yaml")
if [[ -f "$donation_env_file" ]]; then
  compose=(docker compose --env-file "$env_file" --env-file "$donation_env_file" -f "$root/compose.yaml" -f "$root/compose.production.yaml")
fi
cd "$root"
"${compose[@]}" config -q
"${compose[@]}" up -d db

for attempt in $(seq 1 30); do
  db_health=$("${compose[@]}" ps --format '{{.Service}} {{.Health}}' | awk '$1 == "db" { print $2 }')
  if [[ "$db_health" == "healthy" ]]; then
    break
  fi
  if [[ "$attempt" == 30 ]]; then
    "${compose[@]}" logs --no-color --tail=80 db >&2
    exit 1
  fi
  sleep 2
done

install -d -m 0700 "$backup_root"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$backup_root/$timestamp.dump"
"${compose[@]}" exec -T db sh -c \
  'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$backup"
chmod 0600 "$backup"
test -s "$backup"

"${compose[@]}" up -d --build --remove-orphans

for attempt in $(seq 1 30); do
  if "${compose[@]}" exec -T app node -e \
    'fetch("http://127.0.0.1:3000/api/health").then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))' \
    >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == 30 ]]; then
    "${compose[@]}" logs --no-color --tail=100 migrate app caddy >&2 || true
    exit 1
  fi
  sleep 2
done

public_health_url=${PUBLIC_HEALTH_URL:-https://porcupinedirectory.com/api/health}
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 20 "$public_health_url" >/dev/null; then
    break
  fi
  if [[ "$attempt" == 30 ]]; then
    "${compose[@]}" logs --no-color --tail=100 caddy >&2 || true
    exit 1
  fi
  sleep 2
done
"${compose[@]}" ps
printf 'Deployment healthy. Backup: %s\n' "$backup"

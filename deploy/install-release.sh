#!/usr/bin/env bash
set -Eeuo pipefail

root=${1:?deployment root is required}
release_id=${2:?release id is required}

if [[ ! $release_id =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release id must be a full Git commit SHA." >&2
  exit 1
fi

release_dir="$root/releases/$release_id"
archive="$release_dir/release.tar.gz"

test -f "$archive"
test -f "$root/.env.production"
install -d -m 0750 "$release_dir"
tar --extract --gzip --file "$archive" --directory "$release_dir" --no-same-owner
rm -f "$archive"
ln -sfn "$release_dir" "$root/current"

PORCUPINE_ROOT="$root/current" \
PORCUPINE_ENV_FILE="$root/.env.production" \
  "$root/current/deploy/deploy-vps.sh"

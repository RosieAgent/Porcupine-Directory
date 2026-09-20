#!/usr/bin/env bash
set -Eeuo pipefail

root=${PORCUPINE_ROOT:-/opt/porcupine-directory}
env_file="$root/.env.production"

test -d "$root"

postgres_password=$(openssl rand -hex 32)
app_password=$(openssl rand -hex 32)
session_secret=$(openssl rand -hex 48)

umask 077
cat > "$env_file" <<EOF
APP_ENVIRONMENT=production

POSTGRES_DB=porcupine_directory
POSTGRES_USER=porcupine_admin
POSTGRES_PASSWORD=$postgres_password
APP_DB_PASSWORD=$app_password

ADMIN_DATABASE_URL=postgres://porcupine_admin:$postgres_password@db:5432/porcupine_directory
APP_DATABASE_URL=postgres://porcupine_app:$app_password@db:5432/porcupine_directory
COMPOSE_DATABASE_URL=postgres://porcupine_app:$app_password@db:5432/porcupine_directory

APP_ORIGIN=https://porcupinedirectory.com
APP_HOST_PORT=4350
PUBLIC_BIND_ADDRESS=187.77.2.189
SESSION_SECRET=$session_secret
STAFF_AUTH_MODE=session
TRUST_PROXY=1
SUBMISSION_POLICY=published
PASSKEYS_ENABLED=false

FSP_SYNC_ENABLED=true
PUBLICATION_SYNC_ENABLED=true

SMTP_HOST=
SMTP_MODE=smtp
SMTP_PORT=587
SMTP_FROM=
SMTP_USER=
SMTP_PASSWORD=
EMAIL_ENCRYPTION_KEY=

DONATION_BITCOIN_ADDRESS=
DONATION_LIGHTNING_ADDRESS=
EOF

chmod 0600 "$env_file"
printf 'Created %s with mode 600\n' "$env_file"

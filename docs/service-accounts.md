# Listing service accounts

Porcupine supports a small, listing-only service account for trusted automation
and AI-assisted maintenance. The first version allows one listing per request:

- `listings:read` reads the same public listing projection used by the API.
- `listings:write` updates approved listing fields through server validation.
- Events remain FSP-managed and are not writable through this API.
- Delete, archive, publish, user management, role changes, ownership changes,
  batching and direct database access are not service-account capabilities.

Service tokens are environment-bound. A production token cannot be used against
staging or local development. The token is shown only when it is created or
rotated; the database stores only its SHA-256 hash.

## Create or rotate a token

For local or staging, build the server and run the CLI with that environment's
`DATABASE_URL`. On production, run it inside the restricted app container so
the container's runtime database connection is used:

```sh
npm run build
APP_ENVIRONMENT=staging npm run service-token -- create ai-editor staging 90

sudo docker compose --env-file /opt/porcupine-directory/.env.production \
  -f /opt/porcupine-directory/current/compose.yaml \
  -f /opt/porcupine-directory/current/compose.production.yaml \
  exec -T app node dist-server/server/service-token-cli.js \
  create ai-editor production 90
```

Use `rotate` with the same arguments to replace an existing token, or `revoke`
to disable it:

```sh
npm run service-token -- rotate ai-editor staging 90
npm run service-token -- revoke ai-editor staging

sudo docker compose --env-file /opt/porcupine-directory/.env.production \
  -f /opt/porcupine-directory/current/compose.yaml \
  -f /opt/porcupine-directory/current/compose.production.yaml \
  exec -T app node dist-server/server/service-token-cli.js \
  rotate ai-editor production 90
```

Store the printed value immediately in the approved Proton Pass entry. Do not
commit it, put it in a URL, paste it into chat, or include it in logs. Scripts
should inject it at runtime as `PORCUPINE_API_TOKEN`; the application does not
read Proton Pass directly. Rosie agent scripts should resolve the reference
inside `pass-cli run`, never print the resolved value, and keep one item per
environment:

```sh
export PROTON_PASS_AGENT_REASON="Run a Porcupine development API check"
export PORCUPINE_API_TOKEN="pass://Personal/Porcupine Directory Development/password"
export PORCUPINE_API_ORIGIN="http://localhost:4350"
pass-cli run -- ./your-script-that-uses-PORCUPINE_API_TOKEN
unset PROTON_PASS_AGENT_REASON PORCUPINE_API_TOKEN PORCUPINE_API_ORIGIN
```

Use corresponding `Staging` or `Production` items and API origins for those
environments. Do not ask an agent user to paste a resolved token into chat. The
Rosie Codex skill `proton-pass-agent-secrets` documents the shared session and
logging rules.

## API

Read a listing with:

```sh
curl --fail \
  -H "Authorization: Bearer ${PORCUPINE_API_TOKEN}" \
  "${PORCUPINE_API_ORIGIN}/api/v1/listings/LISTING_UUID"
```

Write one listing with an optimistic version and an idempotency key:

```sh
curl --fail \
  -X PATCH \
  -H "Authorization: Bearer ${PORCUPINE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-request-value" \
  --data '{
    "expectedVersion": 7,
    "changes": {"description": "Reviewed description"},
    "reason": "Reviewed against the official source",
    "context": {
      "what": "Updated the public description",
      "why": "The previous description was out of date",
      "how": "Compared the entry with the source page",
      "sourceUrl": "https://example.org/official-source"
    }
  }' \
  "${PORCUPINE_API_ORIGIN}/api/v1/listings/LISTING_UUID"
```

Every successful write creates a normal listing revision containing the
before/after snapshots, service-account identity, request ID, reason, changed
fields and supplied context. A current human administrator can review those
changes at `/admin/audit` and restore an earlier version. Restore creates a new
revision; it never deletes the original history.

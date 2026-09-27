# Listing service accounts

Porcupine supports a small, listing-only service account for trusted automation
and AI-assisted maintenance. The first version allows one listing per request:

- `listings:read` reads the same public listing projection used by the API.
- `listings:create` creates one listing using the site's configured submission
  policy. A published submission may appear immediately.
- `listings:edit` updates one existing listing or its images through server
  validation. Existing `listings:write` tokens remain valid for editing but do
  not receive create permission.
- Events remain FSP-managed and are not writable through this API.
- Delete, archive, publish, user management, role changes, ownership changes,
  batching and direct database access are not service-account capabilities.

New admin-created tokens default to `listings:read` and `listings:edit`.
Grant `listings:create` only to agents that need to add new public entries.

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

Administrators can also delete an account from **Account → Administration →
Service accounts**. Deletion immediately revokes its token and hides the account
from the default inventory. The service-account row and audit history are
retained so prior actions still have an attributable actor; select **Include
deleted** to inspect it. A deleted name can be reused for a new account in the
same environment, but the deleted token can never be reactivated.

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

Create one listing with an idempotency key. The result follows
`SUBMISSION_POLICY`; the service cannot choose to publish or hold a submission:

```sh
curl --fail \
  -X POST \
  -H "Authorization: Bearer ${PORCUPINE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-create-request" \
  --data '{
    "kind": "group",
    "name": "Example group",
    "summary": "A local group for people interested in ...",
    "description": "Details checked against the linked source.",
    "url": "https://example.org/",
    "location": "Concord",
    "tags": [],
    "accessMode": "unknown",
    "reason": "Added after reviewing the group's public page.",
    "context": {
      "what": "Added a new group listing",
      "how": "Checked the public source page",
      "sourceUrl": "https://example.org/"
    }
  }' \
  "${PORCUPINE_API_ORIGIN}/api/v1/listings"
```

Edit one listing with an optimistic version and an idempotency key:

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

Images are uploaded as raw JPEG, PNG, or WebP bytes (up to 5 MB each and 12
active images per listing). The server checks the file signature as well as the
declared content type. Use `listings:edit` to add an image after creating or
reading the listing:

```sh
curl --fail \
  -X POST \
  -H "Authorization: Bearer ${PORCUPINE_API_TOKEN}" \
  -H "Content-Type: image/jpeg" \
  -H "Idempotency-Key: unique-image-upload" \
  -H "X-Image-Alt: The community's meeting space" \
  -H "X-Image-Caption: Meeting space, checked against the source page" \
  -H "X-Image-Reason: Added a current image from the group's public page" \
  --data-binary @meeting-space.jpg \
  "${PORCUPINE_API_ORIGIN}/api/v1/listings/LISTING_UUID/images"
```

Image metadata can be edited with `PATCH /api/v1/listings/LISTING_UUID/images/IMAGE_UUID`
and a JSON body containing one or more of `altText`, `caption`, and `shareable`,
plus a `reason`. Include a unique `Idempotency-Key`. Setting `shareable` to true
also makes that image the listing's community-card image. Image uploads and
metadata changes appear in the administrator activity feed with a direct link
to inspect the listing.

## Further agent and data-quality improvements to consider

These are follow-on options, prioritized by value and risk reduction:

1. **Source provenance and freshness.** Store a source URL and checked-at time
   per important field, so an agent can show what supports a change and flag
   stale descriptions rather than overwrite good data blindly.
2. **Duplicate detection and dry-run.** Normalize URLs and names, return likely
   matches before create, and offer a preview of proposed edits for review.
   This reduces duplicate listings and accidental changes.
3. **Image provenance and safety review.** Capture the original image URL,
   attribution or license note, retrieval date, and alt text. Flag likely adult
   or otherwise unsuitable images for a human review queue; do not let an agent
   auto-publish or delete content based only on a classifier result.
4. **Quality checks and stale-entry queue.** Return field-level validation and
   completeness hints, then let agents identify entries needing attention
   without granting them destructive or publication powers.
5. **Scoped image permission.** If image collection grows, separate image
   upload and metadata scopes from listing edits so an integration can receive
   only the capability it uses.
6. **Bounded bulk import.** Add a previewable batch job with per-entry results,
   strict limits, idempotency, and an audit record for every accepted change.
7. **Per-token limits and lifecycle alerts.** Add request quotas and unusual
   activity alerts, plus reminders for expiring or dormant tokens so admins can
   rotate or remove them promptly.

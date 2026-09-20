# Porcupine Directory

A privacy-respecting community directory for New Hampshire. React/TypeScript, an Express API, and PostgreSQL in an isolated Docker Compose project.

## View the local preview

Open **http://localhost:4350** on this machine. No login is needed.

The preview contains 282 entries from Dennis Pratt’s [Porcupine Directory](https://docs.google.com/document/d/1Gwt7ttZPPgOq_oMCzVmQH9jPtiKA8ORONt9mgg-lBqc/edit) and an initial snapshot of 211 upcoming event occurrences from the [FSP calendar](https://community.fsp.org/calendar/), imported September 18, 2026. Counts change on refresh. Source timestamps are visible on the page.

Dedicated pages are available for groups, channels, businesses, organizations, resources, events, saved entries, submissions, and sources. Filters, sorting, and paging are encoded in URLs. Every listing and event has a stable detail URL with a Copy link action. Fonts are served locally; browsing makes no third-party requests.

Default discovery prioritizes recent confirmation/review, with its exact rules disclosed in **Sources, ranking & privacy** (`/about#listing-order`). Ideas and missing joining details have separate badges and URL filters. See [ranking, proposals and researched contact details](docs/ranking-and-enrichment.md) for the FSP organization profile, public business contact examples and explicitly deferred member-attestation/community-evolution discussions.

See [the architecture guide](docs/architecture.md) for route conventions, state ownership, library choices, and development checks. Localhost links work only on this machine; the same paths will be shareable with others once hosted on a public domain.

The release candidate has a production Compose override and launch checklist in [docs/release-v0.1.md](docs/release-v0.1.md). The Hostinger VPS procedure is in [docs/deploy-hostinger.md](docs/deploy-hostinger.md). The base `compose.yaml` remains the loopback-only local preview configuration.

## Start or rebuild

```bash
cd /home/rosie/Work/porcupine-directory
sudo docker compose up -d --build
```

This machine requires `sudo` for Docker. On machines where your user can access Docker directly, omit it. Containers restart automatically after Docker restarts. The database lives in the named volume `porcupine-directory_porcupine-postgres`.

Only loopback ports are exposed: application `4350`, PostgreSQL `5438`. Rosie Studio has its own containers, network, database, and ports.

```bash
sudo docker compose ps
sudo docker compose logs --tail=80 app db
```

The API health endpoint is http://localhost:4350/api/health.

## Refresh real data

```bash
sudo docker compose exec -T app node dist-server/server/import-cli.js
sudo docker compose exec -T app node dist-server/server/sync-cli.js
```

FSP refreshes automatically every hour while the app is running. The CLI above forces an immediate check. The events pages show the last check, last successful update, next check due, imported window, and any partial/failure warning. Set `FSP_SYNC_ENABLED=false` to disable automatic polling. Directory-document imports remain manual and use stable document heading IDs to update existing rows without duplicates. Imports preserve locally edited/reviewed entries. New submissions are published unconfirmed by default; set `SUBMISSION_POLICY=pending_review` to hold new entries. Directory-source removals and field-level conflict reconciliation are future work.

The document importer preserves categories, descriptions, multiple web links, and joining instructions. It omits template placeholders and appendix entries and does not create person profiles from the owner field. Imported entries are visible in this **local preview**, but have not been independently verified. Classification is provisional; a published invite link never implies open admission. Import timestamps are distinct from confirmation timestamps.

FSP sync reads the calendar’s public WordPress API using the same calendar selection as its public page. It expands the current month (plus seven leading days) through the next 90 days with New Hampshire time zones, recurrence exceptions, moved events, and cancellations. A complete refresh hides obsolete occurrences within that window without deleting them; past history is retained. It stores only event display information, not attendee or author records. The paginated list and FullCalendar month view have shareable URLs. Past or removed occurrences remain readable at their original detail URLs with a status notice.

Open `/events/add` for instructions and links to FSP’s event form, account, access request, dashboard and tutorial. Events must be created/edited on FSP for now. See [calendar integration research and operations](docs/calendar-integration.md) for the verified API, scheduling, failure handling and future-source adapter contract.

Twenty source records had malformed recurrence rules on the first import (for example, `BYDAY=3S`, which does not distinguish Saturday from Sunday). These are skipped and the source status is marked partial; prior occurrences from skipped records are preserved. Use the original calendar to confirm the full schedule. Nothing is written to FSP or Google.

## Develop locally

With the Docker database running:

```bash
npm ci
npm run dev
```

Open http://localhost:5173. Set `APP_ORIGIN=http://localhost:5173` in `.env` for passkeys in Vite development. The development API uses port 3000 and the database uses localhost:5438. Other overrides go in `.env` (see `.env.example`).

```bash
npm run build
npm run lint
npm run format:check
npm test
npm run release:check
npm run test:sync
npm run test:auth
npm run test:browser
```

Browser verification uses `/usr/bin/chromium` and the running preview on port 4350. Change `playwright.config.ts` if your browser is installed elsewhere. Screenshots are written to ignored `test-results/`. Sync integration tests use a temporary schema in this project's local database, remove it afterward, and never fetch from or write to FSP. Override `TEST_DATABASE_URL` only with a development/test database.

## Current limits

Recent additions: [publications and donations](docs/publications-and-donations.md). Porcupine Report has an hourly public feed cache without external media loading. Lightning wallet handoff is configured; Bitcoin is TBD; Nostr zap receipts remain pending. Publication recency does not change ranking. See the [tag-first/UI queue](docs/tag-first-next-batch.md).

This is a local preview, not production. Accounts, recovery phrases, owner editing, bookmarks, editor/admin roles, administrator account management, and audited confirmation/restore are implemented. Staff use approved recent-password verification; passkeys stay hidden. Email recovery delivers only to a local preview inbox. Nostr, scopes, accepted ownership transfers, controlled tag catalog, account export and audit redaction remain queued/future work.

The repository is maintained at [RosieAgent/Porcupine-Directory](https://github.com/RosieAgent/Porcupine-Directory). Production deployment, Hostinger plan verification, persistent secrets, backups, independent security review, and moderation/privacy operations remain before public launch. The production Compose override separates migration and runtime database roles; its deployment values are still required. Compose credentials are for loopback-only development.

Listing service-account tokens, scopes, rotation and the audited single-listing API are documented in [service-accounts.md](docs/service-accounts.md). Events remain FSP-managed.

## Set up your administrator account

**Current preview:** the approved `STAFF_AUTH_MODE=session` policy permits authorized signed-in staff actions without periodic password re-entry. Saved recovery, role/suspension checks, session revocation, CSRF and audit remain; account-security changes still require recent sign-in. Passkeys remain hidden. See [current ownership and staff policy](docs/staff-session-and-owner-dialog.md).

For future host promotion of an existing account, register it and save the recovery phrase. The approved v0.1 policy does not require a passkey. Promote the exact username from the trusted host console:

```bash
sudo docker compose exec -T app node dist-server/server/admin-cli.js YOUR_USERNAME
```

Sign in again with your password. Administration provides a private account list and editor grant/revoke. Recipients must save their phrase first; no default password or first-signup auto-promotion.

See [the Northstar](docs/northstar-spec.md) for the intended product, privacy principles, MVP acceptance criteria, and future ideas.

See the [directory improvement checklist](docs/directory-improvements.md) for planned typed connection links, proposals and editor-assigned ownership, curated icon tags, and an optional table view. Category redesign is deferred for discussion; permission-based Signal/AI integration is post-v0.1 research, not an enabled feature.

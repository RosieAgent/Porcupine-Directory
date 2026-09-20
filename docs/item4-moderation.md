# Item 4: moderation handoff

The owned files implement a standalone private queue and an anonymous public report dialog. Shared core wiring is intentionally left to main/UI agents.

## Wiring

- `server/migrate.ts`: add `013_moderation.sql` to the migration list, after the earlier migrations. The migration adds only private moderation tables and indexes.
- `server/index.ts`: import `{ moderation }` from `./routes/moderation.js` and mount `app.use("/api/moderation", moderation)` after sessions/account loading and before the API fallback. The router also enforces origin/CSRF itself.
- `src/App.tsx`: route `/editor/review` to the named export `ReviewQueuePage` from `./pages/ReviewQueuePage`. Add staff workspace navigation as appropriate.
- Public `ListingPage`: import `{ ReportIssue }` from `../components/ReportIssue` and render `<ReportIssue listingId={entry.id} />` in the listing actions, available to signed-out visitors too. Substitute the existing listing variable for `entry`.
- No `security.ts` change is needed: its current `limit` accepts a string bucket; moderation uses `moderation-report` (five attempts per IP per hour, shared across sessions and replicas).

## API

- `POST /api/moderation/reports`: `{listingId, reason, text?, website?}`. Fixed reasons and the 500-character optional text limit are exported from `shared/moderation.ts`; `website` is the honeypot. CSRF is required without requiring an account. Valid submissions receive HTTP 202 and the same generic `{message}` for published, hidden, absent, and honeypot targets. No report identifier is returned.
- `GET /api/moderation/queue?filter=all&page=1&pageSize=24`: filters `all`, `unconfirmed`, `missing`, `stale`, `reported`, `pending`; page sizes 12/24/48. Oldest entry then UUID gives stable ordering. Report volume never influences ordering.
- `GET /api/moderation/entries/:id/reports?status=open&page=1&pageSize=24`: private, paginated report details plus the current entry version. Status also accepts `resolved`, `dismissed`, `all`.
- `POST /api/moderation/reports/:id/resolve`: `{version, listingVersion, outcome, resolution}`; outcomes `resolved`/`dismissed`, private note 3–500 characters. A changed entry/report or already closed report returns 409. Resolution and its private audit record commit together.

All reads and resolutions require the existing fresh staff verification policy, saved recovery phrase, and unsuspended editor/administrator privileges. The resolution transaction also locks and rechecks the current account role/session before locking the report and entry. Every response from the router uses `Cache-Control: no-store`.

Unconfirmed means no owner confirmation or editor review. Stale means at least one exists but neither is fresh within 180 days. Missing joining details uses the existing SQL completeness helper. Archived entries appear only if they have an open report. Resolving a report does not edit, publish, hide, confirm, or otherwise change trust in an entry; use its stable `/listings/:id/edit` link for those existing editor actions.

Reports retain no reporter account, raw IP, or ownership metadata. Free text and resolution notes are private. The existing rate limiter retains only its short-lived keyed IP pseudonym. Public listing payloads and listing revision content gain no moderation fields. There are no public report lookup routes or report counts.

## Verification

`node --import tsx tests/moderation.integration.mjs` uses the existing local PostgreSQL listener by default, or `TEST_DATABASE_URL`. It creates, verifies, and finally drops only a random `moderation_test_<uuid>` schema. It does not import the production server, run background jobs, install extensions, invoke Docker, or migrate production data.

Coverage includes anonymous receipts, payload bounds, CSRF/origin/honeypot/rate limiting, cross-session spam limits, private staff access, password/passkey freshness, suspension/recovery/session revocation, all queue filters, pagination, unchanged public payload/rank/trust, stale report/entry versions, concurrent resolution, and private audit records.

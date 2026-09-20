# FSP calendar integration

## Location links

Event list and detail pages link the source's venue/city text to an encoded Google Maps search (`api=1`). These are searches, not independently verified pins; visitors should compare results with the original event. Empty and recognized online/undisclosed locations remain plain text. No embedded maps, geolocation permission, API key or background Google request is needed; the destination opens only on click, without a referrer. The month calendar still opens event details first. URL behavior follows [Google's Maps URLs documentation](https://developers.google.com/maps/documentation/urls/get-started).

## Research verified September 18, 2026

The [FSP Community Calendar](https://community.fsp.org/calendar/) uses Stachethemes Event Calendar (STEC). Its [public REST namespace](https://community.fsp.org/wp-json/stec/v5) advertises GET routes for `events`, `calendars`, and `locations`. Read access was verified without credentials; no write endpoints were used. This is a plugin API observed in production, not a guaranteed FSP integration agreement or SLA. Coordinate reuse expectations and operational contact with FSP before public launch.

`GET /wp-json/stec/v5/events?stec_cal=<selected IDs>&context=view&per_page=100&page=1` returns JSON records and WordPress pagination headers (`X-WP-Total`, `X-WP-TotalPages`). The importer reads the public page's `filter__calendar` selection rather than assuming every calendar on their site is in scope. The taxonomy selection is resolved anew each check. Calendar metadata provides default timezones; locations provide venue names. Pagination is bounded and validated before reconciliation.

Source events include wall-clock start/end, timezone, RRULE, EXDATE, recurrence exceptions, approval status, read permission, and cancellation state. Only public, published, approved, unprotected, non-cancelled events are imported. Recurrences expand in source wall-clock time and convert to UTC afterward, preserving local times across DST. Observed all-day records end at 23:59 on their final day; the UI converts that inclusive source date into FullCalendar's exclusive end date. Malformed rules are not guessed. The initial feed contained 20 unreadable rules, including ambiguous `BYDAY=3S`.

## Hourly operation

The app checks due sources at startup and every minute afterward. A source becomes due one hour after its last attempt, including failed attempts. The database timestamp survives restarts; a PostgreSQL session advisory lock prevents overlapping scheduled, CLI, HTTP, or replica runs. A persisted running status with no held lock is treated as an interrupted attempt and retried immediately. The scheduler stops with the app, resumes after restart, and needs no machine-level cron job. This requires an always-running server/container, not static hosting alone.

Each request times out after 30 seconds; the full fetch budget is three minutes. Fetch and schema/pagination validation finish before writes begin. Upserts, missing-occurrence hiding, coverage, counts, and successful timestamps commit in a single transaction. HTTP, schema, pagination, or database failures preserve the previous snapshot and successful timestamp. A failed attempt is recorded separately. Missing occurrences are hidden only within the reconciled window. Records with unreadable rules keep prior occurrences and produce a partial warning; older history remains available. Empty upstream event collections are treated conservatively as a failure rather than mass-removing events.

`FSP_SYNC_ENABLED=false` disables scheduled polling. The default is enabled in Docker and development. Manual refresh: `sudo docker compose exec -T app node dist-server/server/sync-cli.js`. The HTTP trigger requires an administrator session, recent passkey verification and CSRF protection; the legacy shared API key has been removed. Public users cannot trigger FSP traffic. The UI fetches our own metadata and event cache every minute while open, not FSP directly.

`source_syncs` tracks last attempt start, last attempt finish, last successful snapshot (including partial), status, skipped count, item count and coverage. `/api/meta` exposes these plus the expected next poll time and enabled cadence, without raw upstream errors. Last checked must never imply a successful update. The UI warns about failed/partial imports and snapshots older than two hours. Times are shown in New Hampshire time. Coverage is the current month with seven leading days through 90 days ahead, not a complete archive or unlimited future calendar.

The additive `002_event_sync.sql` migration runs before the app serves requests and before CLI sync; it does not reset or reimport the database. Migration and sync locks are separate.

## Browsing and contributing

- `/events`: paginated upcoming list, search/date filters, Today/This weekend/Next 7 days shortcuts.
- `/events/calendar?month=YYYY-MM&q=...`: FullCalendar month grid, matching search, previous/next month links, direct event links, share button. The month/search survive refresh and browser history. The monthly endpoint uses a bounded six-week timezone-aware range and errors instead of silently truncating above 1,000 occurrences.
- `/events/:id`: stable occurrence details, original-event link, freshness and historical/cancellation notices.
- `/events/add`: instructions and external links, not a local event submission form.

The [FSP submission page](https://community.fsp.org/calendar/submit-event/) says to sign in and [request submission access](https://form-usa.keela.co/calendar-access) if needed, then fill out the form. Subsequent editing uses their [calendar dashboard](https://community.fsp.org/calendar-dashboard/). Their main calendar also links a [tutorial](https://weare.dcnh.tv/w/gFjoqAfkgBr4D8Vd6DKJHZ). Account/approval timing belongs to FSP. A newly published event can appear here only once included in the selected public calendars, within the imported date window, and successfully parsed on a subsequent poll.

## Additional sources later

`server/event-sync.ts` defines an `EventSourceAdapter` registry: stable source key, display name, source URL, and `fetchSnapshot(signal)`. Adapters return normalized occurrences with stable keys, coverage, and skipped series IDs (the portion before `:` in occurrence keys). The shared runner owns locking, persistence, status and scheduling. Register public display/submission metadata in `shared/event-sources.ts`. Keys are unique per source, not across sources; cross-source duplicate detection is deliberately future work. Source-specific parsing stays in its adapter. New integrations require permission/privacy review and fixtures before enabling them.

## Verification

`npm test` covers parsing, recurrence exceptions/DST, all-day boundaries, month ranges, pagination completeness and hourly due decisions. `npm run test:sync` uses a disposable database schema to verify failed fetches and failed writes retain data, stable IDs, cancellation reconciliation, partial-rule preservation, overlap prevention and restart recovery. `npm run test:browser` checks metadata, views, URL sharing, external submission instructions, invalid dates, and mobile layout. No tests create anything on FSP.

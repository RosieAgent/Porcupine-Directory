# v0.1 directory work — September 19, 2026

Authorized scope: proposed improvements **1–6 and 8**. Items **7 (production privacy/recovery), 9 (production deployment), and 10 (release automation/repository work)** are explicitly deferred. Local builds, backups and tests below are verification of the requested changes, not a production release. Rosie Studio is untouched.

## Approved checklist

- [x] 1. Curated editor-managed tag catalog with safe icons, aliases, retirement, merging and audit.
- [x] 2. Tag-first entry forms/navigation, combined tag discovery and compatible shared links.
- [x] 3. Compact cards and detail toolbar, lower-right confidence badges, spaced tags and retained source citations.
- [x] 4. Private editor review queue and anonymous issue reports with abuse controls.
- [x] 5. Private ownership invitations requiring recipient acceptance, with race/revocation checks and audit.
- [x] 6. FSP completeness investigation, public structured locations and dated administrator diagnostics; malformed upstream recurrences remain explicitly unresolved.
- [x] 8. Public entry/event sharing metadata in initial HTML, with private-route and token safeguards.

Items 7, 9 and 10 remain deliberately unimplemented by this batch. For staff tools, sign in with the existing administrator account and verify the password when prompted; no credentials were reset or supplied by the assistant.

## Review in the local preview

- `/directory`: unified entries, Business/Nonprofit/Signal shortcuts, selected-filter chips, combined tag filters and existing cards/table views.
- `/tags`: searchable curated tag catalog. Tags in the URL use stable IDs; multiple tags narrow results together (AND).
- `/editor/tags`: authenticated staff create, rename, set bundled icons, add aliases, retire and merge tags. Recent staff verification still applies. Old names and IDs remain useful after renames/merges. Merges are explicitly confirmed and audited; they can invalidate affected entry confirmations as content edits do.
- `/editor/review`: private review queue for unconfirmed, missing-detail, stale, reported and pending entries. Reports are anonymous, rate-limited, bounded and visible only to staff; reports do not influence rank or trust. Resolution is audited and checks entry/report versions.
- `/listings/:id`: Share/Save/Report/Edit toolbar, readable source panel, corrected tag spacing. Cards no longer display type headings; confirmation badges are at the lower right. Known access restrictions, proposal, organizer and missing-detail indicators remain.
- `/listings/:id/edit`: staff can propose private maintenance ownership by exact account username. No edit permission changes until recipient acceptance. `/account/assignments` is the recipient's private inbox. Offers expire after seven days; acceptance requires recent recipient password verification and rechecks entry/proposer state. Accepted changes clear prior confirmation badges. See [ownership policy and tests](ownership-transfers.md).
- `/events`: structured public venue/address/city/state fields improve Google Maps searches. Virtual or restricted locations do not expose physical or meeting-access data. `/admin` includes private skipped-series diagnostics and snapshot dates.
- Public entry/event HTML now includes escaped title/description previews and canonical URLs from the configured origin. Private, draft, hidden and recovery URLs do not expose their data in metadata. Public share controls strip unrelated query parameters/tokens. Actual preview display depends on the receiving app and a publicly reachable domain; localhost is still local-only.

## Migration and compatibility

Additive migrations 010–015 preserve entry/event UUIDs, ownership, connections, bookmarks and prior revisions. Legacy kind metadata remains for old imports/history. New submissions use neutral `entry` instead of pretending to be a Group or Resource. Legacy Business filtering maps to the Business tag; other old category links preserve their original selection rather than silently mapping to unrelated tags. No destructive category drop or entry merge was performed.

The initial tag catalog imports existing names, folding case variants into one definition. Existing businesses receive Business; the sourced Free State Project receives Nonprofit. Other Organizations are **not** automatically asserted to be nonprofits. More entries can be assigned that descriptor through editorial review.

Legacy name arrays remain as compatibility content alongside stable catalog definitions/aliases. Contributor API writes canonicalize and validate names; unknown definitions cannot be created by forged submissions. Retired tags may stay on entries already using them. Staff restores resolve historic aliases, preserving ownership and publication separately. Import and enrichment workflows also require known catalog tags; staff must review/create newly encountered source tags before a new import, rather than letting source text mint definitions. Locally maintained imported records are skipped as before.

Initial backup: `data/backups/pre-tag-first-14GEHA/database.dump` (private and ignored). Baseline and final checks: 284 entries; entry-ID digest `5546a225da188e057a4c2322302a5667`, owner digest `3b321799696d6acb7bad21f96d9e97fc`, connection digest `9c653f743cd9f6f1dccbe0cedccb8f41`; zero account bookmarks. No real ownership transfers or test reports were created.

Browser regression checks caught the existing content-edit trigger clearing dated source references on five descriptor-only migration updates. Migration 015 preserves references during catalog-only changes and recovered those five references from their exact audit revisions. It does not restore confirmations, overwrite later human edits or change ownership. The regression test reproduces both the recovery and the later-edit exclusion. Ordinary factual edits still clear stale references as before.

## Calendar limitation retained honestly

The 20 observed malformed FSP recurrence series contain undocumented one-letter weekdays, including ambiguous `S`/`T`. No dates were invented or rules silently repaired. Valid standard two-letter and ordinal weekday rules remain supported; UTC UNTIL handling was corrected and tested across daylight-saving boundaries. Administrators can now inspect skipped source event IDs, offending tokens/reasons and the diagnostic snapshot date. A failed poll retains its previous data and diagnostics. Upstream corrections require coordination with FSP, not unauthorized changes to their calendar.

The local September 19 refresh loaded 294 occurrences in the 90-day window: 290 physical and four online. Diagnostics recorded the 20 skipped series; restricted location fields and virtual meeting credentials are not imported.

## Verification

Final local verification passed:

- Production build and strict TypeScript, ESLint, Prettier and `git diff --check`.
- 50 unit tests, including source locations, malformed recurrence diagnostics, sharing metadata and privacy guards.
- 68 desktop/mobile browser tests, including tag combinations, toolbar keyboard/touch use, catalog editing, report resolution and administrator diagnostics. Staff UI fixtures use intercepted requests, not the owner's account.
- Isolated authentication, password-only staff policy, tag migration/permissions/provenance, ownership acceptance/races, moderation/rate limits/races and calendar-sync integration suites.
- App/database Docker health checks and final entry-ID/owner/connection checksums match the baseline. The owner's business remains published at revision 2 with its original private owner and no contact links.

Disposable test schemas/accounts are removed afterward. Local screenshots were inspected for public cards/detail pages and staff mobile forms. This does not constitute an independent production security review or completion of deferred launch work.

## Still deferred

Production email, account deletion/export and retention/redaction policy; Hostinger/domain/HTTPS deployment; GitHub push, CI and release automation; Nostr/passkeys; Signal ingestion; Who's Who; notification delivery; member attestations and activity-based ranking. None was enabled by this batch.

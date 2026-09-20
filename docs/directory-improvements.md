# Directory improvements — delivery checklist

Latest delivery: [approved items 1–6 and 8](v01-directory-batch.md) supersede older queued-status notes below. Controlled tags, tag-first discovery, card/toolbar cleanup, review reports/queue, accepted ownership and event diagnostics are implemented; production items 7, 9 and 10 remain deferred.

## Latest decisions and next batch

The [tag-first/admin/UI queue](tag-first-next-batch.md) retains the original requirements; [the delivery checklist](v01-directory-batch.md) records the implemented batch. Curated tags now drive entry forms and navigation; legacy categories remain only for compatibility. Ownership transfers require recipient acceptance. The owner's requested temporary business entry is published as “AI Automation & Business Technology,” with no contact link; Granite & Gear was not chosen.

Staff policy is now explicitly approved as recent password verification (15 minutes), with roles, audit, saved-recovery prerequisites, revocation and recovery suspension retained. Passkeys stay hidden. The admin-only user list and private host-issued administrator invitation flow are implemented; the owner's account is already activated. Local email preview is configured, not external delivery. Bitcoin displays TBD with payments disabled; the owner-supplied Lightning address is configured. See [staff setup and preview mail](staff-preview-setup.md).

## PD-17 — Resource clarity and public-source enrichment

- [x] Remove redundant unknown-access text from Resource cards, retaining confidence icons and known restrictions.
- [x] Research and apply 18 source-attributed, version-checked updates; preserve existing entry/connection IDs, destinations and audit history. Classify Anie's Hive and Born Free Family as service businesses.
- [x] Correct Porcupine Report's primary YouTube link to the official channel homepage; retain the playlist, audio destination and old imported episode as additional resources.
- [x] Flag the imported Moms For Liberty workshop as past, rather than implying current registration or a verified local chapter.
- [ ] Complete blocked/ambiguous sources and unresolved linkless entries using the [research follow-up list](research/2026-09-19-resources.md). No private Signal content collection.

## PD-18 — Recent public episodes

- [x] Add a dedicated detail-page section with six publisher-provided titles/dates, source links and last attempted/successful check timestamps.
- [x] Poll the reviewed Porcupine Report RSS feed hourly server-side; persist the cache, serialize workers and preserve results on errors. Bound response size/time and prohibit arbitrary URLs/redirects/entities.
- [x] Keep browsing anonymous; no external media/thumbnail requests, viewing history, automated confirmation or ranking changes.
- [ ] Evaluate a YouTube uploads adapter if needed; the published feed URLs returned 404 during research. The working RSS integration lists podcast releases, not all YouTube uploads.
- [ ] Decide activity-aware sorting, evergreen-resource treatment, cadence, failure handling and manipulation defenses before any ranking change.

## PD-19 — Follow-up discussion: private update notifications

- [x] Record opt-in entry/change subscriptions in the Northstar, distinct from saved bookmarks.
- [ ] Compare local/in-site updates or RSS with opt-in email/push; minimize identifiers and retention.
- [ ] Define change types, digest frequency, consent/withdrawal, quiet hours, cross-device privacy and subscription deletion. No public followers/social graph or browsing-based enrollment.
- [ ] Review a design before implementing delivery; no notifications are sent by this release.

## PD-20 — Optional donations

- [x] Add a shareable `/donate` route and navigation entry, Bitcoin/Lightning method panels, accessible copy/wallet actions and honest disabled/error states.
- [x] Validate Bitcoin mainnet addresses with a standard library and encode Lightning Address wallet handoff as LNURL. No wallet secrets, custody, donor profiles, payment tracking or paid ranking.
- [x] Explain public-chain/address-reuse and payment-provider privacy limits; make no anonymity or tax-deductibility claim.
- [x] Configure the owner-supplied Lightning Address and check public LNURL-pay metadata without requesting an invoice or payment. Bitcoin remains explicitly TBD, disabled until supplied. Provider/endpoint availability is not independent proof of ownership.
- [ ] Configure and implement actual NIP-57 zaps after choosing a recipient public key/provider and receipt privacy. Ordinary Lightning payments are not labeled completed Nostr zaps.
- [ ] Discuss Dash, Monero, USD and optional per-donation addresses for future versions.

Setup and verification: [publications and donations](publications-and-donations.md). Database backup: `data/backups/pre-resources-XwdPU2/database.dump` (restricted, ignored). All 18 applied entries are revision 3, source-attributed and not marked confirmed. Existing IDs, destinations and history are retained; no category-wide merge or duplicate-calendar deletion.

Verification: strict TypeScript/build, ESLint, all nine unit-test files, isolated publication-cache and authentication/email/role/history integration tests, and all 51 desktop/mobile browser tests passed. The real preview returned six feed items, latest #127, with attempted/successful check dates and a 60-minute interval. All 19 pre-existing connections in the batch retain their original IDs and URLs; total listing count remains 283. Donation configuration returns both methods disabled. Desktop and mobile screenshots were inspected, including no third-party media requests and no mobile overflow. No payments, notifications, private-channel reads, owner impersonation or Rosie Studio changes were made.

## Earlier deliveries and remaining v0.1 work

Status: PD-01/02/07, PD-03 proposal/missing-data controls, PD-06 icon presentation and PD-10/11 are implemented. PD-04 ownership transfer and PD-05 controlled catalog remain. The category-to-tag direction is decided and queued; member attestations, community evolution and Signal integration remain research/discussion.

Account/location follow-up: [delivered fixes](account-and-location-fixes.md). Replacement staff authentication and local SMTP preview have now been approved and implemented. External mail remains unconfigured. The specific host-audited test-entry repair does not complete PD-04's general assignment/acceptance workflow.

This checklist implements the [Northstar requirements](northstar-spec.md), not a replacement for the existing authentication, calendar or production-launch work. The first implementation batch also adds private host-issued account setup invitations, punctuation-friendly usernames and horizontal icon-only account actions. Near-term items below track the remaining v0.1 work; category redesign needs a later product decision, and Signal ingestion is explicitly post-v0.1.

## Sequence and dependencies

| ID    | Work item                                    | Release intent           | Depends on                                                |
| ----- | -------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| PD-01 | Typed, multiple connection points            | Implemented              | Existing listing/revision model                           |
| PD-02 | Connection icons, editing and filtering      | Implemented              | PD-01                                                     |
| PD-03 | Proposed communities and missing-data states | Controls implemented     | Product decisions below                                   |
| PD-04 | Editor-mediated account ownership            | Next v0.1 improvement    | Assignment consent decision; existing authorization/audit |
| PD-05 | Curated tag catalog and contributor picker   | Next v0.1 improvement    | Existing tag inventory and editorial mapping              |
| PD-06 | Icon/emoji tag display                       | Presentation implemented | PD-05 for editor-managed definitions                      |
| PD-07 | User-selected compact table view             | Implemented baseline     | PD-02; incorporate PD-03/PD-06 as available               |
| PD-08 | Group/channel taxonomy workshop              | Deferred discussion      | Real examples; no dependency for PD-01–07                 |
| PD-09 | Consented Signal events and optional AI      | Post-v0.1 research only  | Feasibility, permission and retention decisions           |

Suggested order: connection model → connection UI/filter → proposal/ownership workflows → curated tags → table view → integrated acceptance checks. PD-03/04 and PD-05 can be developed independently after their decisions are settled. Do not block useful connection improvements on taxonomy redesign.

## PD-01 — Preserve multiple typed connection points

- [x] Inventory existing primary URLs, imported link arrays and contact URLs; distinguish participation destinations from source attribution.
- [x] Define shared TypeScript/Zod and PostgreSQL contracts for stable connection IDs, type/platform, URL, optional label and ordering; retain multiple links of the same type.
- [x] Specify safe classification rules, supported initial platforms, editorial correction, unknown/generic fallback and URL validation. Do not fetch private links to classify them.
- [x] Create an additive, repeatable migration preserving existing destinations, labels and invitation fragments; do not synthesize absent URLs or destructively rewrite meaningful URL components.
- [x] Include connections in atomic revision snapshots, conflict checks and restore. Material connection changes invalidate confirmation/review just like other content edits.
- [x] Update import handling without overwriting locally maintained connections; preserve source provenance.

Acceptance: a single entry supports Signal plus a website plus another labeled connection, with no URL loss through import, editing or restore. Zero connections is supported when genuinely unknown or proposed. Use Free State Theatre's stored Signal destination as a regression fixture after verifying its classification; tests do not join or contact the chat.

## PD-02 — Recognizable connection actions and search

- [x] Build a reusable, accessible connection-link component for cards, details and table cells using existing libraries where possible.
- [x] Use distinct Signal/website/other-service icons, descriptive hover/focus/touch details and safe generic fallback; add distinguishing labels for otherwise identical icons.
- [x] Expose all connection points without requiring a detail-page visit solely to open a destination; keep sharing the listing itself separate from opening an external service.
- [x] Add a connection-type filter to the existing `FilterComponent`, API validation/query and shareable URL state. Combine it with current text/topic/location/access filters across all listing kinds.
- [x] Keep pagination/counts based on distinct listings even when an entry has several matching connections.
- [x] Cover new-tab behavior, external-link safety, accessibility, multiple same-platform connections and invalid URLs. No background third-party icon/preview requests.

Acceptance: “all Signal chats” returns entries with Signal connections regardless of whether their listing kind is Group or Channel. The destination type is clear at a glance and the entry still shows its access rules and trust status.

## PD-03 — Proposals are not merely missing data

- [x] Agree on proposed/existing/unknown terminology and a separate “seeking an organizer” indication. Do not equate a missing account owner with a missing real-world organizer.
- [x] Add the agreed state to shared contracts, storage, editor controls and revision history, independently of publication and confirmation/review.
- [x] Make submission/edit validation support a useful proposed group with no current organizer or link, without requiring made-up descriptions or contact data; keep sufficient intent/title information and existing abuse controls.
- [ ] Audit sparse imported entries for editorial classification. Preserve unknown status where the source does not establish whether a group exists.
- [x] Show a clear icon/tooltip and detail explanation for proposals; offer state filtering in both cards and table view without silently changing the public-unconfirmed default.
- [x] Test a linkless existing group, a proposal seeking an organizer, a proposal maintained by an account, and an unowned existing listing.

Acceptance: visitors can tell “someone would like this group to exist” from “this group exists but we lack joining details.” Neither is presented as confirmed solely because an editor classified it.

## PD-04 — Editor-mediated entry ownership

- [x] Decide recipient consent: explicit acceptance is required before edit rights transfer. Record the decision in the Northstar.
- [ ] Finalize reassignment/removal, expiry and confirmation handling before implementing the write endpoint.
- [ ] Add a staff-verification-protected editor/admin assignment proposal and recipient acceptance workflow. No public/editor-browseable user directory or required email; the separate administrator-only operational account list is allowed.
- [ ] Keep editors able to maintain entries directly, including anonymous/imported/proposed entries. No ownership transfer is required for an editor to correct information.
- [ ] Enforce ownership changes transactionally on the server with current authorization, expected revision and a reason; audit actor, previous/new internal owner IDs and timestamp without publishing them.
- [ ] Give the recipient access only to the assigned entry; remove the previous owner's owner-based access immediately. Do not grant an editor role or change saved-entry privacy.
- [ ] Keep account ownership private and separate from a public group contact/organizer. Content restore must not restore old owners or role assignments.
- [ ] Protect assignments from subsequent imports and test unauthorized self-claims, stale transfers, revocation and owner-only editing of the assigned entry.

Acceptance: an editor proposes assignment; the authenticated recipient accepts before gaining entry-specific edit access. The previous owner retains access while pending and loses owner-based access on acceptance. No site-wide editor role is granted. Anonymous submitters cannot self-claim; private identities and history remain protected.

## PD-05 — Editor-managed tag definitions, contributor selection

- [ ] Introduce a shared tag catalog with stable IDs, names, safe icon/emoji values and listing associations; distinguish editing a definition from selecting it for an entry.
- [ ] Inventory legacy strings; review duplicate/alias mappings and assign appropriate icons without guessing away meaning. Preserve associations and existing shared tag-filter URLs.
- [ ] Add audited editor/admin catalog management for creation, name/icon updates and retirement/merge behavior that preserves historical meaning and does not silently lose assignments.
- [ ] Replace free-form contributor tag creation with a searchable catalog picker showing names and icons. Owners can select/deselect existing tags only on their own entries; anonymous creation can select existing tags too.
- [ ] Enforce catalog-management permissions in API routes, not only the UI. Reject forged new tag definitions/unknown IDs, and keep existing owner/editor authorization for tag assignments.
- [ ] Define how imports surface unmapped topics for editorial review without automatically creating definitions or silently discarding source topics.
- [ ] Include catalog changes and listing/tag assignment changes in audit coverage; test rename/merge/retirement, permissions and restore behavior.

Acceptance: an editor creates “Gardening” with an approved icon/emoji; a contributor can find and select it but cannot rename it, change its icon or create a new catalog tag. Existing records retain their topics after migration.

## PD-06 — Compact, understandable tag icons

- [x] Display tag icons/emojis on cards with complete names available by tooltip and accessible name; retain full name + icon in tag pickers and filters.
- [x] Preserve clickable tag-to-filter links and their shareable URLs. All tags wrap visibly; no hidden overflow requires an extra control.
- [x] Support keyboard/focus and touch users; do not use emoji or color as the only way to learn a tag's meaning. Provide a safe fallback for missing legacy icons during migration.
- [x] Visually distinguish topic tags from external connection actions and confirmation/review/proposal badges.
- [ ] Verify readable layout and touch targets on narrow cards and dense table rows.

Acceptance: cards are more compact without making the tag meaning or navigation inaccessible. Tags retain both their names and icons in the underlying catalog.

Delivery note: presentation is implemented using a central, bundled icon mapping for existing names, not the future database-backed catalog. All original strings remain unchanged; arbitrary new strings use a neutral icon. Catalog permissions, stable IDs, curation/audit and restricted contributor selection remain explicitly open in PD-05. The concise table intentionally continues to omit topic columns; narrow card/detail layouts are covered by browser checks.

## PD-07 — Cards by default, concise table by choice

- [x] Add an icon-based view selector with accessible labels and selected-state feedback; do not change the default card experience.
- [x] Use an appropriate Material UI table/grid with library controls and server-side search/sort/pagination, not a separate implementation of filtering semantics.
- [x] Define compact columns: entry name/detail link, typed connection actions and essential trust/proposal/access context. Include tags where they remain legible.
- [x] Encode view selection in the URL; retain filters, sort and compatible paging on switches. Direct loads, refresh and back/forward must reproduce the same selection without login.
- [x] Support direct Signal/website links from rows, including more than one destination per entry, with no duplicate listing rows from joins.
- [x] Test empty/error/loading states, keyboard interaction and narrow-screen table behavior without overflowing the whole page.

Acceptance: a visitor selects Signal connections and table view, gets a concise list of direct links, and shares a URL that opens the same filtered table for another visitor. Opening an entry retains its stable detail URL.

## PD-08 — Category discussion superseded by tag-first decision

- [ ] Collect examples of channel-only communities, groups with several channels/sites and apparent duplicates with sparse descriptions.
- [ ] Discuss keeping both kinds, treating channels as connection points, or supporting explicit group/channel relationships and overlapping classifications.
- [ ] Agree on user-facing language, browse/filter behavior and migration rules before changing categories.
- [ ] Plan preservation of UUID/detail URLs, bookmarks, source keys, access instructions, ownership and audit history if consolidation is approved.

Decision received: all records become entries described by controlled tags and connection-derived facets. The historical discussion tasks above are superseded by the [tag-first migration checklist](tag-first-next-batch.md). Existing categories remain only until a preservation-tested migration ships; no automatic merge or destructive deletion.

## PD-09 — Future Signal event integration and optional AI

- [ ] Research feasible/permitted integrations and event mechanisms; do not assume an official API/webhook or treat a public invite as permission to read/republish messages.
- [ ] Define channel/participant consent, permitted content, opt-in/out, revocation and deletion/retention boundaries. No monitoring is authorized by this task list.
- [ ] Prototype only with approved synthetic/test data after approval, including event deduplication, provenance, retries and a proposed-update queue.
- [ ] Evaluate optional AI relevance filtering/summarization as a separate step; decide what data, if any, an external model provider may receive.
- [ ] Require human/editor review before publication initially, with any later automation requiring a new explicit policy. Treat chat content as untrusted input, including prompt-injection attempts.
- [ ] Exclude unrelated history, member lists, identities and private conversations. Preserve consent-based Who's Who and all other Northstar privacy boundaries.

Acceptance for this future task: a feasibility/consent design for event-driven suggested updates, not a live channel reader. No Signal connector or AI publication agent in v0.1.

## Completion gate for the near-term batch

- [ ] Resolve the identified product decisions and record them in the Northstar before implementing ambiguous workflows.
- [ ] Keep existing URLs, imported data, anonymous browsing/submission, private ownership/bookmarks and the central publication policy working.
- [ ] Cover new migrations with preservation checks; test URL validation, permissions, ownership transfer, audited tag changes and restores in disposable schemas.
- [ ] Add browser coverage for mixed connection types, linkless proposals, tag accessibility, Signal filtering and shared table URLs on desktop/mobile.
- [ ] Run strict TypeScript, lint, formatting, unit/integration and browser checks; do not alter Rosie Studio or its services.
- [ ] Update current-behavior documentation only as features ship; check off tasks with verification evidence rather than marking plans complete.

## First-batch verification — September 18, 2026

- Live preservation check: 282 listings, 207 actionable connections, 290 events; zero legacy link destinations lost. Free State Theatre retains its exact Signal invitation fragment. Database backup: `data/backups/pre-connections-auF9ir/database.dump` (local, ignored, restricted).
- Passed strict TypeScript/build, ESLint, Prettier, unit tests, disposable-schema auth/data integration, calendar sync integration and 21 desktop/mobile Playwright checks. No test rows from automated tests enter the live directory.
- Migration tests cover repeat execution and old-revision restoration. Connection tests cover multiple Signal links on one entry, cross-kind filtering without duplicate counts, hostile URLs, review invalidation, stable IDs, import idempotency/local-edit protection and browser form reordering. Empty/error states, same-row auth icons, Signal destination safety, table refresh/history/paging and mobile overflow are covered.
- Original PD-07 delivery retained text tags on cards. Superseded: cards now show topic icons, and proposal badges are implemented. The concise table retains trust/access/proposal context without topic columns. PD-05 catalog-management workflows remain pending.
- Role setup tests cover server-bound roles, hash-only tokens, expiry, one-use consumption, reserved usernames, host renewal, real browser activation and passkey gates. Local `test.user`/`test.editor` are pending activation through private setup links, not shared-password accounts. The owner’s administrator username remains to be chosen.
- Remaining after subsequent deliveries: PD-04 assignment acceptance decision and PD-05 curated tag catalog, management permissions and contributor selection. PD-03 controls and PD-06 icon presentation are implemented. No category merge, Signal monitoring, external messages or Rosie Studio changes were made.

## PD-10 — Transparent confirmation-first discovery

- [x] Place confidence badges before the entry type in the top status row, on cards/details/table; retain accessible date tooltips.
- [x] Apply role-based tiers using checks within 180 days: both recent checks, editor review, owner confirmation, neither. Alphabetical/UUID tie-breakers; explicit name/recent sort overrides; no popularity or behavioral signals.
- [x] Show stale checks with a recheck icon and original timestamp; age alone never increases confidence. Material edits invalidate badges and rank boosts.
- [x] Rename the public information page to Sources, ranking & privacy and disclose algorithm, expiry threshold, defaults, lack of independent quorum guarantees, and disclaimers.
- [x] Test tier order, expiry/future-date boundaries, alternate sort, badge position and keyboard date tooltips.

## PD-11 — Organization profile and reviewed public contact enrichment

- [x] Add Organization and its route without merging Group/Channel categories; correct the existing FSP entry in place.
- [x] Enrich FSP from its mission, contact, social and community pages, retaining imported destinations and original attribution. Distinguish official accounts from organization-linked community chats.
- [x] Add optional public phone/general email/business address/hours fields with validation, editing, audit and restore support; no private account identity fields.
- [x] Apply a small sourced batch to The Jefferson and SoHo; show dated evidence separately from confirmation. Keep ambiguous/obscured contact information unknown.
- [x] Provide a host-only, version-checked atomic enrichment workflow. No crawler or automatic research-to-confirmation promotion.
- [ ] Decide whether/how to consolidate calendar resource listings, preserving existing URLs/bookmarks/history and the independent event-source adapter. Nothing deleted.
- [ ] Review the remaining sparse entries and additional business sites before further enrichment. No blanket classification based on blank data.

## PD-12 — Future discussion only: attestations and community evolution

- [x] Record these ideas in the Northstar and [policy/design notes](ranking-and-enrichment.md); no implementation authorized in this batch.
- [ ] Decide the meaning, content-revision binding, freshness, withdrawal, privacy and multiple-account defenses for member attestations. Avoid social scores, public social graphs and vote-count ranking.
- [ ] Discuss channels growing into groups or organizations, stable identity/history, related listings and optional organizing tools. Do not force a maturity ladder or infer consent/leadership.

## PD-13 — Invite-only visibility and privacy-preserving instructions

- [x] Show a focusable lock beside the type for invite-only/private entries in cards, table and details; do not imply the listing itself is private.
- [x] Relabel the existing audited access-instructions field for restricted groups, retaining owner/editor permissions and anonymous-submission rules.
- [x] Encourage group-managed external request/contact links, without collecting invitation requests or requiring personal contact data.
- [x] Warn contributors that instructions are public, private invite links/personal contacts need permission, and revisions are retained; disclose this on the public policy page.
- [x] Cover lock visibility, keyboard tooltips, invitation form state, mobile layout and unchanged instructions when switching restricted access modes.

## PD-14 — Readable connections, NHLA and complete-first discovery

- [x] Replace connection icon-buttons with recognizable platform icons beside readable, underlined links; root websites show domains, other resources retain distinguishing labels and destination tooltips.
- [x] Deduplicate visible destinations regardless of label, preferring an existing HTTPS version for standard-port HTTP/HTTPS pairs. Preserve stored URLs, IDs and history; do not merge different paths, queries, invitation fragments, hosts or nonstandard ports.
- [x] Expand the existing NHLA entry into a sourced Organization without changing its UUID or importing people profiles. Link its website, membership, volunteering, resources, social destinations and external calendar; do not add automatic event synchronization in this batch.
- [x] Put entries without joining/contact details last for every directory sort, before pagination. Disclose grouping, preserve missing-only filtering and apply selected sorting within groups.
- [x] Add a Create entry icon-link to My entries for signed-in users, including the empty state, through the existing privately owned submission flow.
- [x] Choose **Granite & Gear — AI Automation & Business Technology** as the owner's working business name; keep the [services draft](business-concept-draft.md) unpublished pending public contact/account choices. Name/domain/trademark availability and legal structure remain undecided; hosting is exploratory.
- [ ] Decide whether to integrate NHLA events as a second calendar source after reviewing feeds, permissions, attribution and cross-source duplicates. Its website also exposes a Liberty Ratings API; do not import political ratings or add ranking effects without a separate product decision.

NHLA research: [reviewed input](research/2026-09-18-nhla.json), based on its official homepage, About, Membership, Volunteer and Events pages. Applied as revision 3 without self/editor confirmation. The existing imported endorsements URL is preserved. Backup: `data/backups/pre-nhla-WU9duZ/database.dump` (restricted, ignored). No business link was deleted: four duplicate HTTP/HTTPS pairs are collapsed for display only.

## PD-15 — Account navigation and password typo prevention

- [x] Move sign-out to the global top-right header beside Your account; distinguish signed-out sign-in, pending/error state and signed-in account/logout. Preserve privacy and show retryable logout errors.
- [x] Require exact password confirmation for signup, setup invitations, phrase recovery, email recovery and signed-in password replacement. Keep login single-field, use password-manager autocomplete, show inline mismatch feedback and clear both values after success.
- [x] Keep confirmation entirely client-side; retain server-side password validation and session/security semantics.
- [x] Verify desktop/mobile header placement, failure/retry, owned creation and every password-setting flow.

Third-batch verification: strict TypeScript/build, lint, formatting, unit tests, isolated auth/data integration and all 38 browser tests pass. Integration tests cover completeness outranking recent checks across pagination for every sort; the same boundary was checked against all 282 live entries in all three orders. My entries creation now invalidates its cached list so the new owned entry appears immediately. Password tests block mismatches before network requests in all five setting/recovery flows and confirm the repeated value is absent from request payloads. Header logout is tested through failure/retry and real isolated sessions, including mobile placement. NHLA keeps its existing UUID and the four business duplicate pairs remain recoverable in unchanged stored data. Rosie Studio was not modified.

## Second-batch verification details — September 18, 2026

The preview retains 282 entries; 67 currently lack joining/contact details under the documented completeness rule (including bare invitation prompts with no destination/contact). No existing sparse entry was guessed to be a proposal. FSP, The Jefferson and SoHo each gained a sourced revision without owner/editor confirmation. FSP retains its original UUID and all imported links. Both calendar resource entries and calendar sync remain unchanged.

Backup before migration/enrichment: `data/backups/pre-trust-context-WXBBV0/database.dump` (local, restricted and ignored). New unit/integration coverage includes ordering, expiry, proposals, stale writes/restores, public contact validation, enrichment all-or-nothing rollback, retained fields, reference clearing and anti-forgery. Desktop/mobile coverage includes the new badge location, focus dates, filter URLs, FSP profile, source policy and no whole-page overflow. Automated tests use disposable schemas or read-only browser fixtures rather than publishing invented communities.

Strict TypeScript/build, ESLint, formatting, five unit-test files, isolated authentication/data integration and calendar synchronization checks pass. The invitation UI and prior functionality passed 29 Playwright browser checks. A regression discovered during testing was fixed: changing filter URLs no longer remounts the copy-link control and drops keyboard focus. No Rosie Studio files or services were changed.

## PD-16 — Compact connection hierarchy and gym classification

- [x] Show one main website plus primary platform destinations; move secondary destinations to a collapsed Additional resources section on cards, table and details.
- [x] Omit ordinary same-site subpages from the public connection list when an existing homepage is available. Preserve all stored URLs/IDs, revisions and source citations; never fabricate a homepage.
- [x] Add optional Automatic / Primary / Additional placement with existing permission, revision and restore semantics; retain meaningful query/fragment links and different hosts/ports.
- [x] Prefer NHLA's Facebook page as primary and place its Facebook group in additional resources, without deleting either or labeling inferred links official.
- [x] Apply the researched Free State Barbell Club category/service/contact update to its existing UUID, without a confirmation badge or private/member information.
- [x] Record business/venue versus associated community relationships as future discussion only.
- [ ] Defer passkey UI to v0.2 after deciding how staff authenticate in v0.1. Existing staff authorization currently requires passkey verification; do not silently remove that protection or hide the only way to satisfy it.
- [x] Complete build, unit/integration, desktop/mobile browser and preservation checks.

Barbell research: [reviewed input](research/2026-09-18-barbell.json), using its official homepage, Contact, Memberships and FAQ pages. Published pricing and reviews are not copied into the entry. Backup: `data/backups/pre-barbell-ESa03U/database.dump` (restricted, ignored).

Fourth-batch verification: build/strict TypeScript, lint, formatting, unit tests, isolated auth/data integration and 39 browser checks passed. NHLA has three primary links and one expandable resource. Barbell is revision 3, keeps its original UUID/homepage connection ID, has four dated references and remains unconfirmed. Connection placement survives API save and editor-form reordering; legacy placement is preserved when rebuilding unchanged connections. Desktop/mobile screenshots inspected. No URLs or historical records deleted, no new group invented, no authentication policy or Rosie Studio changes made. The passkey deferral remains awaiting a staff-authentication decision.

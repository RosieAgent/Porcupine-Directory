# Porcupine Directory — Northstar and MVP specification

Status: draft v0.1, September 2026

Implementation update (September 19 UTC): the local preview uses the explicitly approved session-only staff policy (no 15-minute re-entry), private admin user management and local-only email preview. Passkeys remain hidden; roles, saved-recovery prerequisites, audit and recovery suspension remain. See [staff sessions and owner dialog](staff-session-and-owner-dialog.md). This is not a public production release.

Delivery update: typed multiple connections, connection filtering, table view, explicit proposals/seeking-organizer flags, missing-details badges, confirmation-first ordering, public contact fields, topic-icon presentation and legacy categories are implemented. The latest agreed direction replaces top-level categories with curated tags and connection-derived platform discovery; this migration is **queued, not shipped**. Private ownership assignment now requires recipient acceptance; its workflow and the controlled tag catalog remain to be implemented. See the [next-batch queue](tag-first-next-batch.md) and [delivery checklist](directory-improvements.md). Member attestations and community evolution remain discussion items; Signal ingestion/AI assistance is beyond v0.1.

## Delivery and security posture through v1.0

Until v1.0, prioritize fast, reversible delivery over adding process. Keep the baseline protections already implemented—server-side authorization, CSRF/origin checks, rate limits, session revocation, audit events, private account boundaries and secret separation—in every release. Do not introduce heavyweight review gates, release ceremony or infrastructure work solely to improve security if it materially slows the product loop.

Low-friction security fixes can still ship when they fit naturally into feature work. Track deeper hardening as a post-v1.0 backlog, including stronger branch and environment protections, immutable GitHub Actions pinning, CODEOWNERS/review ownership for workflow and deployment files, a documented threat model or independent review, deployment-key rotation, backup/restore drills and deeper monitoring. This is a sequencing decision—not permission to weaken current safeguards or knowingly ship a critical vulnerability.

## Northstar

Help people find their way into a freer New Hampshire community without requiring them to already know the right person, channel, or event.

Porcupine Directory should make community knowledge legible, discoverable, and voluntary: people can browse without an account, organizations can explain how to participate, and contributors can share useful information without surrendering an identity profile.

## Problem

Community information is spread across group chats, channels, businesses, calendars, spreadsheets, and personal networks. A source spreadsheet is a useful starting inventory, but it is difficult to search, hard to keep current, and usually lacks the participation context that matters most:

- Is this open to everyone, public but moderated, invite-only, or private?
- How does someone get invited or ask a question?
- Is this an online channel, an in-person group, a business, a resource, or an event?
- When was this information last confirmed?

## MVP v0.1 outcome

Navigation requirement: dedicated section and entry routes, with ordinary discovery paths within 3–4 actions. Search, filters, sorting and pages must survive refresh and browser history and be shareable through the URL. Every published listing and event occurrence must have a stable detail URL. Prefer established React libraries and Material UI controls; see architecture.md for implementation conventions.

A visitor can:

1. Browse and search a structured directory of groups, channels, businesses, and resources.
2. Filter by curated tags, connection platform, access model and location; legacy type filters remain compatible during the queued migration.
3. Open a listing and see its description, links, access instructions, source, and freshness.
4. See upcoming events sourced from the approved FSP Community Calendar feed.
5. Submit a new listing anonymously, publicly visible with an unconfirmed icon by default; anonymous submitters cannot edit it afterward. Signed-in contributors can edit their own entries and explicitly self-confirm them.
6. Save local-only interests or pinned listings in the browser without a server-side identity.
7. Optionally create a private account to synchronize saved entries across devices without providing an email or real identity.
8. Recognize and follow multiple typed connection points on one entry, and filter across all entry categories by connection type (for example, Signal).
9. Choose a concise table view instead of the default cards, with the view and filters preserved in shareable URLs.
10. Distinguish a proposed community seeking an organizer from missing joining details. Topic icons have full-name tooltips and shareable filter links; editor-managed tag definitions remain planned.
11. See dated confirmation badges and a public explanation of confirmation-first ordering. Queued: remove the top-level category label, raise card titles and move confidence icons to the lower corner. Choose another sort without login. Old checks do not gain trust merely through age.

An editor can:

1. Import the source document after an export is supplied.
2. Globally review, edit, publish or hide entries; review badges are independent of self-confirmation and visibility. Scoped editor permissions are deferred beyond v0.1.
3. Inspect revisions and preview/restore previous content as a new revision, without overwriting concurrent changes.
4. Administrators privately browse/search accounts and assign/revoke global editors. Authorized staff actions use the active signed-in session without periodic password re-entry. Keep role checks, audit, saved-recovery prerequisites and recovery suspension; account-security changes retain recent sign-in checks. Events remain source-managed.
5. Administrators may issue and revoke environment-bound service tokens for trusted automation. A listing-only service account may read and immediately update one listing at a time with explicit scopes, a reason, optional change context, optimistic version checks, idempotency and revision-backed restore. Events remain FSP-managed; service accounts cannot delete, batch, publish, hide, manage users or access the database directly.
6. Maintain proposed/unowned entries directly. Assign private entry ownership using a staff-only searchable account-picker dialog, with recipient acceptance before access transfers. A No account option permits an optional private manager alias but grants no user editing rights. Never expose this account list or manager label publicly.
7. Planned: manage a shared tag catalog (name plus icon/emoji). Contributors select existing tags for their entries but cannot create or modify tag definitions.

## Explicit non-goals for v0.1

- No required login for browsing.
- No public people wiki.
- No Signal message ingestion, event-driven channel monitoring, or AI processing of channel content, even for groups described as public; this is future research only.
- No user-to-user messaging or social graph.
- No marketplace transactions or payment handling.
- No automatic self-confirmation, editorial approval or public account attribution merely from signing in.
- No collection of legal names, phone numbers, precise location, or behavioral tracking by default.

## Core information model

### Listing

Target: one entry with a name, summary, description, typed connections, curated tags, coarse location, access instructions, source and dated checks. Business/nonprofit/topics are overlapping descriptors rather than mutually exclusive kinds. Current storage still uses `group | channel | business | resource | organization`; preserve legacy kinds as needed for migration, old filters, import compatibility and historical revisions. Optional publicly advertised business/organization contacts remain separate from private account data. A nonprofit tag is not certification of legal or tax status.

### Connection points — implemented

One listing can have zero, one, or several connection points: for example, a Signal chat and a website, or multiple separately labeled chats. Each connection point has a stable identifier, a platform/type, a destination URL and an optional distinguishing label. Keep provenance/source references separate from destinations for participating in the community.

Use recognizable platform icons beside readable, underlined connection links, not icon-only buttons. Root website links display their domain; other destinations use distinguishing labels. Hover/focus tooltips show the actual URL and platform. Deduplicate visible destinations regardless of label, including standard-port HTTP/HTTPS variants (prefer an already-supplied HTTPS link). Preserve stored URLs/IDs/history, path case, query parameters, fragments, nonstandard ports and distinct hosts; no redirect fetching, www stripping or tracking-parameter removal to infer equivalence. Prefer existing icon libraries and safe local assets. Never infer that a Signal link guarantees access or that its contents are public.

The user's example is Free State Theatre: its Signal connection should visibly read as Signal, not as a generic website. Verify the stored destination during implementation rather than inventing a missing link. Preserve all existing URLs and labels during migration, including invitation fragments; do not collapse a multi-link entry into a single primary URL. Where classification is ambiguous, allow editorial correction and a safe generic fallback. Browsing must not contact third-party services just to display icons or previews.

Connection type is independent of listing category. A group may have a Signal channel, a website, both, or neither. Filtering for Signal must find matching entries across categories, not only entries currently classified as channels.

Primary connection presentation: show one main website and the main destination for each social/chat platform. Prefer an existing homepage over its subpages, without constructing a new URL; if only a subpage is known, retain it as the primary destination. Secondary platforms/chats and different websites go in a collapsed **Additional resources** section. Automatic Facebook selection favors a page over a group, without asserting ownership/official status. Ordinary same-host website subpages are omitted from the public connection list when a homepage is available, but remain stored, editable and audited. Query/fragment-bearing links and different hosts/ports are not discarded. Dated source citations stay separate from connections.

Each connection can be Automatic, Primary connection or Additional resource. Owners/editors can set placement using existing editing permissions; permit only one explicitly primary website. Explicit resource placement can retain an important same-site request form or other subpage. Legacy entries/revisions without placement use automatic presentation. A placement edit follows the normal audited content-change and confirmation-invalidation policy.

### Proposals and incomplete data — implemented; ownership assignment planned

Represent “I would like this group to exist” explicitly as a proposal, with a separate indication when an organizer is sought. Missing links or descriptions alone do **not** establish that an entry is a proposal, inactive, or unowned. Preserve unknown values honestly and allow useful proposals without fabricated contact details or filler descriptions.

Proposal/existence state, organizer availability, private account ownership, publication, confirmation and editorial review are separate concepts. A proposed group can have an account maintaining its page without having a community organizer yet. An existing group can be listed without an account owner. Keep proposed entries visually distinct from operating communities and allow users to filter for them; retain the public-unconfirmed default and configurable publication queue.

Discovery puts entries missing joining/contact details below entries with usable details, before pagination, for every directory sort. Confirmation tiers or the selected name/date order then apply within each completeness group. Missing data remains visible and filterable, not hidden. Disclose this ordering publicly; a confirmation badge does not override missing joining information.

An editor can update an entry directly now. Planned: assign its maintenance to an existing account; that owner could then edit the entry without site-wide moderation privileges. Account ownership remains private and is not a public assertion that the person leads or represents the real-world group. Anonymous submitters cannot self-claim an entry afterward. Editor-mediated assignment remains a pending explicit workflow, not automatic claiming.

Assignment, reassignment and removal must be audited and checked server-side. **Recipient acceptance is required**, as decided by the user: an authenticated recipient accepts a private pending proposal before edit access transfers. Any existing owner retains access while pending; the recipient gains none until acceptance. On acceptance, the previous owner's edit rights end unless independently authorized. Support decline/cancel/expiry, recheck authority and stale state, and resolve atomically. Ordinary content restore must never restore ownership. No required email or public/editor-browseable account directory; a minimum-data admin-only user-management screen is separately requested.

### Presentation modes — implemented baseline

Cards remain the default. Users can explicitly switch to a compact table without signing in. Both views represent the same filtered dataset, permission rules, confirmation states, sorting and pagination. The table should make tasks such as “show all Signal chats and open their links” concise: show entry name, connection icons/direct links, and enough status/context to avoid confusing proposed or unconfirmed entries with established communities.

View and connection filters live in the URL alongside existing query state; refresh, back/forward navigation and copying the URL reproduce the selection. Switching views preserves active filters, sort and paging. `/directory?connection=signal&view=table` opens the implemented Signal table. Material UI Table/TableContainer and the shared server-side search, sorting and pagination serve both views. Phones use two compact columns, with trust/access and saved controls beneath each entry name so connection links remain visible. Any overflow stays inside the table, not the whole page. Proposal context and card topic icons are implemented; the concise table omits topic columns. Editor-managed tag definitions remain planned.

### Tags — icon presentation implemented; editor-managed catalog planned

Current presentation maps legacy names to bundled Material UI icons (Housing → house; Learning → book), with a neutral tag fallback. Cards show all tags as 44px icon links, wrapping rather than hiding overflow. Hover, keyboard focus and touch long-press expose their names; accessible link names always identify the topic. Details, search options and selected form topics pair names with icons. Existing names, assignments and filter URLs are unchanged. This is not yet a database-backed curated catalog: forms still allow free-text topics, and editor-only creation/rename/merge/retirement and stable catalog IDs remain PD-05 work. No external images or tracking requests are used for icons.

Each shared tag has a stable identity, a human-readable name, and an editor-selected icon/emoji. Editors and administrators can create and maintain definitions. Ordinary users cannot create, rename or change tag icons, but can search and select existing tags when creating or editing their own entries. Anonymous submissions likewise select from the existing catalog; neither public forms nor imports should silently create new catalog definitions.

Cards use compact icon/emoji shorthand, with the complete tag name available by tooltip and accessible text. Pickers and filters show names plus icons so people can learn unfamiliar symbols; do not rely on color or emoji recognition alone. Preserve tag-to-filter navigation, provide a way to discover tags beyond any visible limit, and support keyboard/touch access to their names.

Migrate existing free-text tags without losing associations or breaking shared filters. Normalize aliases/duplicates through editorial review, not speculative merging, and preserve enough revision information to interpret old tag assignments after renames. Use a safe icon/emoji catalog, not user-supplied executable markup or third-party tracking images.

### Tag-first taxonomy — queued decision, supersedes retaining categories

Remove the high-level category from forms, cards and primary navigation once the controlled catalog is ready. Everything is an entry; curated tags describe businesses, nonprofits, topics and other useful attributes. Some descriptors may be mapped from controlled form answers, and others selected from existing tags. Only editors/administrators create or maintain definitions; enforce this on the server, including anonymous submissions and import workflows. Current free-text contributor tags must be replaced before treating this restriction as delivered.

Platform facets such as Signal derive from typed connections, not manually selected topic strings. Clicking a Signal browse icon finds all matching entries; it does not infer admission, activity or trust. Keep in-app filtering distinguishable from outbound links. Provide searchable tag discovery, meaningful shortcuts, explicit combined-filter semantics and shareable URL state with card/table views. Preserve old category routes and query links through compatibility mappings; do not invent equivalences where mappings are ambiguous. Preserve entry URLs, bookmarks, source references, permissions and history. No entry merges or content deletions are implied. Detailed tasks and acceptance checks are in the [next-batch queue](tag-first-next-batch.md).

The classifications below describe **historical/current data**, not a requirement to retain categories in the target UI:

Targeted correction: Free State Barbell Club is a Business based on its gym memberships/services, retaining its stable entry identity. Future discussion: distinguish a venue/business from a community that meets or trains there, potentially with a related-entry relationship. Do not create a new lifting group, infer its membership or suggest affiliation without evidence/consent.

Further researched corrections: Independence Inn → Business; Liberty Ballot → Resource; Young Americans for Liberty → Organization. Working distinction: Organization represents an established mission-led body/chapter network; Group represents an informal community of people; Channel represents a communication space. These are practical editorial descriptions, not claims of incorporation or nonprofit status. The original UNH YAL Instagram is distinguished from the national organization website. Only the three specifically requested Signal listings were reclassified as Channels; finding a Signal connection does not automatically reclassify other groups/resources.

Shortened connections retain their original URLs and IDs. A reviewed redirect header can establish a connection's platform, but not its admission rules, current chat activity, ownership or trust. Never assume every TinyURL is Signal, fetch private chat content or join groups to determine an icon. Checks are dated source references and auditable changes, not confirmation badges. Unrelated/unresolved redirects require editorial follow-up. See [review notes](research/2026-09-18-topics-and-links.md).

Channel and Resource cards currently omit “Access not confirmed.” Queued: remove that redundant line from all entry cards, including Businesses and Groups, without losing unknown-access data, lock indicators or actual joining restrictions. Queued card layout moves confidence to the lower corner and removes the type label; retain dates, tooltips and accessible status information.

### Entry-page actions — queued

Place Share, Save and permission-appropriate Edit actions at the far right of the breadcrumb row, without duplicate actions in the content body. Use a share glyph instead of the chain-link glyph, keeping reliable copy/shareable-URL behavior, tooltips and clipboard fallback. Edit enters the existing edit route/mode; authorization stays server-side. Add consistent leading/icon-label spacing to tag pills. Remove the standalone original-source action but retain a readable original-source link and all attribution inside the source-information section. Use Material UI controls with keyboard/touch access and responsive wrapping.

### NH area selection and ownership safeguards — implemented

Entry forms and location filters use a searchable local NH catalog: towns/cities/unincorporated places, counties, regions and statewide New Hampshire. Normalize recognized names case-insensitively and preserve unknown legacy values when editing existing records; do not allow arbitrary new misspellings. Location is about an entry's coverage/base, not a private account's residence. One area per entry in v0.1; multiple coverage areas and geographic containment are future enhancements. Shared lower-case town filters remain usable. See [dataset provenance and behavior](account-and-location-fixes.md#location-catalog).

Community stage now says “Not sure yet” for unknown existence; it is separate from unconfirmed access. Signed-in forms must not silently submit anonymously when the session expires or changes. Account owners may remove an entry from public browsing while keeping it in My entries and private audit history; deletion is recoverable archiving, not a promise to erase prior revisions. Publication remains editor-controlled. Ownership itself stays private.

### Access mode

`open`, `public`, `invite_only`, `private`, or `unknown`. The interface should explain the difference in plain language and never imply that an invite-only group is open.

Invite-only and private entries display an accessible lock in the shared top status row (cards, table and detail pages). Their form and detail page label the existing access instructions as **How to request an invitation**. Owners/editors can maintain these instructions under the existing permissions and audited revision workflow; anonymous submission remains supported without subsequent anonymous editing.

Privacy boundary: the group may be private but the directory listing and its instructions are public. Prefer a group-managed external request form or public contact-page connection rather than copying personal contact details. The form warns against publishing private invitation links or another person's name, email or phone without permission, and explains that revisions are retained. No personal contact data is required; an unknown process can remain blank. The directory does not collect, relay or store invitation requests or applicant identities. External services have their own privacy practices; deleting current text does not erase historical revisions.

### Event

An event has a source event ID, title, description, start/end time, venue, city, source URL, and sync metadata. FSP calendar events are read-only in the MVP; community-added events can be considered after a moderation flow exists.

FSP's public API is polled approximately hourly while the server runs. Show last attempted check separately from last successful update, the import window, and partial/failure warnings. A failed poll must preserve the previous snapshot. Provide dedicated list, month calendar and stable event detail routes, with shareable filters/months. For now, "Add an event" explains FSP's account/access requirements and links to its submission form; Porcupine Directory never collects those credentials or submits on the visitor's behalf. Keep source adapters separate so additional approved event sources can be added later. See [calendar integration](calendar-integration.md).

### Submission

Signed-in users can create a privately owned entry from My entries, including its empty state. Global header actions distinguish sign-in from account/sign-out without displaying private usernames. All forms that set a password require exact confirmation; confirmation is not stored or transmitted. Business offerings can be drafted without prematurely publishing a contact identity, claiming registration or assigning an owner.

The public add form publishes an unconfirmed record by default. A central submission policy can instead hold new entries for publication if abuse increases; no schema/UI redesign is needed. Ownership is private. Owners explicitly self-confirm saved content, editors can independently review it, and material changes clear both old badges. Anonymous entries have no submitter edit capability and cannot be automatically claimed. Rate limiting is implemented; broader bot protection, abuse reporting and operational moderation remain launch requirements.

## Privacy and trust principles

1. Browse first; account second. Core discovery never requires a login.
2. Prefer local-only preferences. Favorites and topic interests default to browser storage.
3. Minimize metadata. Store only what is needed to publish and maintain a listing.
4. Consent before profile features. A future Who’s Who is opt-in, editable, revocable, and separate from ordinary directory participation.
5. Human review for sensitive content. No automated agent should publish claims about people, events, sales, or groups without an explicit review policy.
6. Source transparency. Show where a listing came from and when it was last checked.
7. Respect channel boundaries. Signal, private group, and member-only content must not be ingested without permission from the channel owners and affected participants.
8. Optional accounts collect a private username, optional alias, credential verifiers/public keys, roles and necessary operational metadata. Encourage a generated recovery phrase; verified email is optional. Nostr remains a future authentication method.
9. Recovery revokes credentials/sessions and suspends elevated access until reapproved. Keep an audit of content and security changes, never raw authentication secrets. Revision storage needs a deliberate redaction/retention policy.

## Future opportunity areas

- Entry evolution and community-building tools: discuss a channel growing into a group or organization, stable identity/history, related entries, optional organizing support and consent. No automated “maturity” ladder or growth score; not implemented in this release.
- Bounded, revision-specific member attestations: explore dated evidence and withdrawal without popularity contests, public social graphs or mandatory identity collection. Resolve multiple-account manipulation and independent-evidence semantics before implementing rank influence.

- Opt-in alerts for selected topics, regions, or event types.
- Nostr as an optional identity or verification path, never as a requirement.
- Anonymous or pseudonymous contribution with abuse controls that do not require a public identity.
- A consent-based builder profile / Who’s Who with approval, preview, revision, and removal workflows.
- A moderated Buy/Sell board with clear rules, expiration, and no escrow.
- Human-in-the-loop source assistants that summarize permitted public feeds into review drafts.
- Permission-based, event-driven Signal integration: channel activity could propose relevant directory updates, events or announcements, optionally filtered/summarized by AI. This is **not part of MVP v0.1** and is not a claim that a suitable official integration API exists. Research feasibility and permitted integration mechanisms first. A public invitation is not consent to republish messages or participant identities. Require explicit channel/participant permissions as appropriate, opt-in/out and revocation, minimal retention, source attribution, duplicate handling and an editorial review policy. Treat messages as untrusted input; an AI suggestion cannot grant permissions or silently publish content. Never bypass access controls or collect unrelated chat history/member lists.
- Federation or export so the directory is not a single point of control.

## Brainstorming prompts for the next product session

- What is the smallest useful unit of connection: a listing, a person, an event, a request, or a pathway?
- Which questions should every listing answer before it is considered trustworthy?
- What would make a visitor feel safe clicking “contact” without the site becoming a surveillance layer?
- Which information should expire automatically unless someone re-confirms it?
- How can communities claim or correct a listing without requiring a centralized identity?
- What is the review quorum for sensitive or disputed listings?
- Should Buy/Sell be a separate product surface with separate moderation and retention rules?
- What evidence would justify an AI-assisted importer, and what content must always stay out of scope?

## Success signals

- A new visitor finds a relevant group or event in under two minutes.
- Search results are understandable without knowing the source spreadsheet’s terminology.
- Listings clearly explain participation and access expectations.
- Corrections have an owner, source, timestamp, and review state.
- The project can operate without requiring visitors to disclose who they are.

## Public media, freshness and sustainable funding

### v0.1 delivery

- Resource cards use the top confidence badge instead of repeating “Access not confirmed.” Known access restrictions remain visible.
- Public website research improves descriptions and participation guidance through version-checked, audited updates, not automatic confirmation. Preserve original links and stable entry URLs. Anie's Hive and Born Free Family are service businesses; imported chat descriptions must not substitute for verified participation details.
- Porcupine Report's primary video connection is the official FSP YouTube channel homepage. Its playlist, audio show and original episode remain available as additional resources. A dedicated detail-page section lists six recent titles/dates from the publisher's podcast RSS feed, including special editions, checked hourly server-side. It is an audio-feed listing, not a claim to enumerate all YouTube uploads. Do not load external players, thumbnails or audio automatically. Retain cached items on failure and distinguish last attempted check from last successful check.
- Publication activity does **not** grant confirmation badges or affect current ranking. Current completeness-first/confirmation-tier ordering stays unchanged. Saved entries remain private bookmarks, not notification subscriptions.
- `/donate` offers account-free wallet handoff without donor profiles, payment tracking or paid ranking. Bitcoin is TBD with payments disabled. The owner's Lightning Address is configured; its public LNURL metadata was checked without requesting an invoice or payment. No custody, signing or automatic transfer. Actual Nostr zap receipts remain pending.
- Standard Lightning payments are not Nostr zap receipts. Actual NIP-57 zaps need recipient public-key/provider configuration and a separate privacy decision; do not advertise them as working before that is implemented. No tax-deductibility or nonprofit-status claim for this project.

### Follow-up discussion: activity-aware discovery

Consider opt-in freshness sorting for blogs, podcasts and video resources. Record publisher-reported publication date, observed/check date and last successful fetch separately from owner/editor confirmation. Resolve per-medium update cadence, valid evergreen resources, edited/backdated/future dates, episode duplication, spam bursts and feed downtime before introducing rank effects. A failed feed check is not evidence of inactivity. Publication count must not become a popularity score. Any ranking change needs public explanation, predictable tie-breakers and user-selectable alternatives; retain the missing-joining-details rule unless explicitly revised.

### Follow-up discussion: opt-in update notifications

Allow a visitor to explicitly subscribe to an entry or selected change types (new episode, changed participation details, event changes); saving alone must not subscribe them. Explore a private in-site “since last visit” view or user-controlled RSS before email or push. Anonymous/local preferences should remain possible. Cross-device subscriptions must stay private; no public follower counts, social graph or viewing history. Define consent, preview, unsubscribe, frequency/digests, quiet hours, expiry and retention. Push endpoints/email addresses are personal metadata and require deliberate storage and deletion policies. Do not infer subscriptions from browsing or send anything before explicit opt-in. No notification transport is implemented in v0.1.

### Funding follow-ups

Discuss actual Nostr zaps, optional per-donation Bitcoin addresses and privacy tradeoffs of public receipts before implementation. Dash, Monero and USD support are future decisions: review operational costs, provider data collection, availability and required disclosures before committing. Contributions must never affect discovery ranking or access to community data.

## September 19 implementation update

Further tag consolidation: IRL replaces in-person variants; Learning replaces Learning (Adult); independent Politics/Activism/Single Issue descriptors replace compound political labels; Volunteer replaces the organization-specific FSP team label. Website consolidates Internet/Web and is derived from supplied website connections. The proposed 18+ label remains a follow-up policy discussion: do not infer age restrictions from adult-learning categories. See [topic label cleanup](maintenance/topic-label-cleanup.md).

Tag curation follow-up: use concise, independent topics/descriptors, not street addresses or imported explanatory sentences. Location belongs in structured area/address fields. Facebook, Telegram and Slack labels now follow actual supplied link destinations, not platform mentions in prose; this must not imply joining access, confirmation or endorsement. See the [taxonomy cleanup and policy](maintenance/tag-taxonomy-cleanup.md).

The approved v0.1 improvements 1–6 and 8 now have a [delivery record](v01-directory-batch.md): curated editor-managed tags, tag-first navigation and combined filters, compact card/detail actions, private moderation reports/review queue, recipient-accepted ownership, public structured event locations/admin sync diagnostics, and safe public sharing metadata. Existing stable links/history/ownership are preserved. Production recovery/privacy, deployment and release automation remain explicitly deferred; earlier implementation-status paragraphs are historical where they conflict with that record. No Nostr, Signal ingestion, member attestations, notifications or popularity ranking is introduced.

# Next batch — tag-first entries and administration

Status: the owner authorized improvements 1–6 and 8. Their implementation and compatibility details are recorded in [the September 19 delivery](v01-directory-batch.md), which supersedes the queued status below. Production recovery/privacy, deployment and release automation are explicitly excluded. The original checklist is retained as requirement context, not a claim that the work is still unimplemented.

## Delivery sequence

1. Resolve staff authentication and provide the owner's administrator account through private activation; improve admin-only account management.
2. Apply card/detail presentation cleanup independently of the data migration.
3. Deliver PD-05's controlled tag catalog, contributor picker and server-side permissions.
4. Migrate to tag-first discovery and forms, keeping existing links, history and permissions intact.
5. Implement recipient-accepted ownership assignment (PD-04); run preservation and permission tests throughout.

The preceding resource/feed/donation batch is complete. Lightning is configured; Bitcoin remains TBD. Local SMTP preview works; external delivery stays unconfigured. All eight currently linked business websites have a first research pass; five businesses without a website need attributable sources. See [business inventory](research/2026-09-19-businesses.md).

## Administrator access — priority

- [x] Reserve the owner-chosen username using a private 24-hour one-use setup invitation. Instructions are in a restricted local file; the assistant has not chosen a password or consumed activation.
- [x] Implement the explicitly approved 15-minute recent-password staff policy; retain roles, saved-recovery prerequisites, audit and suspension. Passkeys remain hidden; the loss of extra passkey protection was approved.
- [x] Leave password/recovery setup to the owner. A read-only check now confirms activation completed and recovery was marked saved; the invitation is consumed. No default/shared password, credentials in chat or account impersonation.
- [x] Provide admin-only searchable/paginated account management with identifier, username, role and relevant setup state only. Editors cannot browse accounts; no emails, credentials, recovery material or bookmarks are returned.
- [x] Retain audited editor grant/revoke and affected-session invalidation under fresh verification. Administrator promotion remains host-controlled.
- [ ] Verify entry editing, review, publish/archive, history and restore with the real admin role; owner controls remain scoped to owned entries. Keep recovery-related privilege suspension.

## Card cleanup

- [x] Remove “Access not confirmed” from **every entry card**, including business and group cards, detail-page chips and table views. This is redundant wording, not removal of the underlying unknown-access state, confidence icons or actual restriction instructions. Forms and filters still describe the underlying access state.
- [ ] Remove the top-level category/type label and let the title move up into the freed space.
- [ ] Move confirmation/confidence icons to the card's lower corner (start with lower right, verify at mobile sizes). Retain dated hover/focus tooltips and clear unconfirmed/stale states; avoid collisions with topic icons or saved controls.
- [ ] Preserve lock, idea/seeking-organizer and missing-joining-details indicators. Their meaning remains independent of topic/type tags; do not make absent metadata look confirmed or public.
- [ ] Preserve existing ordering and accessible keyboard/touch targets. A presentation change does not grant trust, change publication or change ranking.

## Entry page actions and spacing

- [ ] Add a shared page-action slot aligned at the far right of the breadcrumb row. On entry details, put Save next to Share; show Edit for the owner or authorized editor/admin, with any required verification handled explicitly.
- [ ] Replace the current link-chain copy glyph with a recognizable share icon. Keep the shareable-URL copy behavior, clear tooltip, success feedback and manual-copy fallback; no public account/security tokens in shared URLs. Native share-sheet behavior is optional and must not replace a reliable copy option.
- [ ] Edit enters the existing dedicated entry edit route/mode; retain unsaved-change/conflict and authorization safeguards. Hidden controls are not authorization checks.
- [ ] Remove duplicate Save/Edit actions from the content area after moving them to the toolbar.
- [ ] Give icon+text tag pills consistent leading inset and icon-to-label spacing using Material UI styling; inspect wrapping, focus and touch layouts.
- [ ] Remove the standalone “View original source” action. Keep the original source URL and attribution as a readable link **inside the source-information section**, alongside dated references; never delete provenance from stored data or history.

## Tag-first entry model — agreed direction

Everything is an **entry**. Business, nonprofit and other descriptors become curated tags, not mutually exclusive entry kinds. An entry can have several descriptors, topics and connection platforms. Remove the required category question and category-centric navigation once the controlled model and compatibility migration are ready.

Delivered update: contributor forms and API writes now require existing catalog tags; only staff can create definitions. The original checklist below is retained as historical acceptance criteria; see the current [delivery checklist](v01-directory-batch.md) for status and remaining limitations.

- [ ] Staff-managed stable tag IDs, names, aliases and safe local icon/emoji definitions; audited create/rename/merge/retire actions.
- [ ] Searchable existing-tag selector for anonymous submitters and owners; neither may create definitions, spoof unknown IDs or alter icons through API requests. Owners select existing allowed tags only for their entries.
- [ ] Distinguish contributor-selected tags from server-derived facets. Record the controlled form-answer/derived-tag mapping so a form answer can select an existing catalog value without minting arbitrary definitions.
- [ ] Derive Signal/platform discovery from actual typed connections, not a free-form “Signal” tag or an unchecked form answer. A Signal browse icon filters all entries with matching connections, regardless of former kind, without joining chats or fetching invitation contents. Keep outbound connection links distinct from in-app filter links in semantics and accessible labels.
- [ ] Keep nonprofit as an editorial descriptor, not proof of incorporation, tax status or independent confirmation. Do not convert all legacy Organizations into nonprofits, or infer platform/access/trust from a topical tag.
- [ ] Preserve existing tags and entry/connection IDs. Review legacy-kind mapping: retain Business meaning where already established; do not automatically add unwanted Group/Channel/Resource tags merely to recreate the old categories under new names.
- [ ] Keep any legacy kind fields needed temporarily for imports, old revisions and route compatibility. No destructive drop, blanket reclassification or entry merge as a shortcut. Old snapshots must remain interpretable/restorable without regaining removed privileges.

## Discovery and navigation

- [ ] Provide an Explore hub with searchable tag/facet discovery, recognizable Business/nonprofit/platform shortcuts and a catalog that does not require guessing tag names. Keep Events, Saved, My entries, Add entry, Donate and source/privacy pages accessible.
- [ ] Consolidate the filter UI around text search, tags, platform, NH area, access, confirmation/completeness, sort and view. Clearly label selected filters and make removal/reset easy. Proposed baseline: selected tags narrow results together (AND); make this explicit and test combinations such as Business + Signal.
- [ ] Preserve cards/table, pre-pagination completeness grouping and existing confirmation ordering. No popularity or hidden activity boost.
- [ ] Stable URL state for tags, platforms, search, sort, view and paging; back/forward, refresh and copy/share reproduce results.
- [ ] Preserve old category routes and `kind=`/name-based tag links through compatible filtered views or explicit redirects. Where no faithful new tag mapping exists, retain a legacy filter until reviewed rather than silently widening/narrowing shared results.
- [ ] Cover common journeys within 3–4 actions: all businesses; entries with Signal chats; nonprofit resources in a chosen NH area; a saved entry's latest information.

## Ownership assignment — decision received

**Recipient acceptance is required.** An editor/admin proposes transfer to a specific existing account; edit access does not transfer until that recipient accepts while authenticated. Any current owner retains their permissions while the proposal is pending; a proposed recipient gains none. Private maintenance ownership is not a claim that someone leads the real-world community.

- [ ] Define pending/accepted/declined/cancelled/expired assignment states with one active proposal and an explicit expiry policy. Recipients can see and accept/decline proposals inside their account without requiring email.
- [ ] Recheck recipient, current owner, entry state and proposing staff authority at acceptance; block stale, replayed, superseded or unauthorized proposals. Handle staff revocation and concurrent ownership changes explicitly.
- [ ] Atomically switch ownership on acceptance; revoke prior owner edit rights unless independently authorized; audit proposal and resolution. Account identity/assignment notices are not public listing fields.
- [ ] Retain existing anonymous-submission rules: no automatic claiming, no edit token implied by submission, and no bypass through tag edits or content restore. Ordinary content restore never restores historical ownership.

## Completion gates

- [ ] Permission tests for anonymous/user/owner/editor/admin, including forged tag definitions, role escalation, private user-data access, stale sessions and transfer races.
- [ ] Migration tests preserve shared links, entry IDs, source citations, saved entries, owners, confirmation semantics, imports and readable/usable history.
- [ ] Desktop/mobile and keyboard/touch tests cover toolbar placement, chip padding, badge position, catalog navigation, tag combinations and old/new URLs.
- [ ] Back up before data migration; run build/typecheck/lint/format, unit, isolated auth/data/transfer integration and browser suites. Update current-behavior docs only after delivery. Do not modify Rosie Studio.

# Confirmation, proposals and public-source enrichment

## Implemented ordering policy

Cards and tables share the same server-side policy. First, entries with joining/contact details come before entries missing those details, across the entire filtered result set before pagination. This applies to every directory sort, even when a missing-details entry has recent confirmations. In each of these two groups, the default `sort=confirmed` orders published, filter-matching listings by recent editor review + owner confirmation, editor review alone, owner confirmation alone, then neither. These correspond to internal tiers 3/2/1/0, not probabilities or user reputation. Each tier is alphabetical with UUID as the final stable tie-breaker. `sort=name` and `sort=recent` bypass the confirmation ordering within each completeness group. Missing entries remain visible and filterable; this is not a publication gate. Private saved-list ordering and the editor's My entries management list are unchanged. There is no click, bookmark, follower, donation or personalized ranking signal.

“Recent” means a server timestamp within the preceding 180 days; future timestamps receive no boost. The threshold is declared in `shared/trust.ts` and used by the SQL ordering and badge UI. Old checks remain dated history with a recheck icon, but no boost. Material changes and restores clear checks; repeated checks never accumulate points. Badge tooltips are keyboard/touch accessible and display date/time in America/New_York. Confirmation comes before the type in the card/table status header, with proposal/missing-data flags alongside rather than in the tags footer.

Self-confirmation is an account-owner assertion, not verified organizational authority. Editor review requires a recent passkey, but is not necessarily independent: one account can own and review the same entry. These are transparent operational signals, not safety guarantees, endorsements or proof of consensus. Website/source research does not confer either badge. Public explanations are at `/about#listing-order` (“Sources, ranking & privacy”), linked from the sort control.

Member attestations are **not implemented**. Before adding them, decide what the attestation means (working link, current activity, joining instructions), bind it to a content revision and date, allow withdrawal, avoid public social graphs, limit repeats, and address multiple-account manipulation without demanding personal identity. Count inflation must not become a popularity contest or an assertion of independent corroboration. Consider showing bounded evidence separately from default ordering before assigning any rank weight.

## Proposals and incomplete entries

`lifecycle`: `unknown` / `existing` / `proposed`; `seekingOrganizer` is independent of private account ownership. The lightbulb means an explicit idea, not simply a sparse entry. No invented URL is required; a useful title and short intent are still required. Existing imports stay unknown unless their source establishes existence; blank entries are never automatically ideas. The missing-details badge is derived from the absence of links, public phone/email and usable participation instructions. Generic importer placeholders/disclaimers and bare prompts such as “Ask to join” or “Request an invitation” do not count as instructions. This is a data-completeness check, not a link-health checker.

Filters `lifecycle=proposed`, `needs=organizer`, and `needs=joining_details` work in cards/table and shareable URLs. Stage/organizer/contact changes use the existing authorization, optimistic revisions, audit and restore rules. Neither flags nor an anonymous contribution create a claim/transfer right. An account can maintain a proposal while seeking a separate real-world organizer. Private ownership assignment remains pending the consent workflow decision in PD-04.

## Organizations and richer entries

`organization` and `/organizations` cover nonprofits and other organizations. FSP is reclassified in place, preserving UUID, bookmarks and links. This targeted category addition is not a general Group/Channel migration. “Nonprofit” is an attributed source description, not a directory tax-status certification.

Optional public phone, general email, business/organization address and opening-hours text are editable fields; no account identity data is collected. Displayed addresses are not presumed visitor venues, and hours should be reconfirmed before travel. Historical revisions retain prior content; contributors are warned not to submit private details. Precise personal/home addresses and personal contact enrichment are out of scope.

## Research evidence and safe application

The reviewed input is [the September 18 research file](research/2026-09-18-enrichment.json). It covers FSP and two business examples, The Jefferson and SoHo. Summaries are paraphrased, public contacts are attributed, source-check dates are distinct from source update dates, and no third-party pages are embedded or fetched by visitors. Northwoods also publishes a general contact email, but was only researched, not updated in this batch. No bulk crawler or live external agent is installed.

Primary sources:

- FSP [mission/nonprofit description](https://www.fsp.org/learn/mission/), [social page](https://www.fsp.org/connect/social-media/), [community links/disclaimer](https://www.fsp.org/connect/find-your-people/), [public contact](https://www.fsp.org/connect/contact/), [home/event links](https://www.fsp.org/).
- [The Jefferson](https://thejeffersonnh.com/) publishes a restaurant phone, general email, street address and opening hours.
- [SoHo](https://sohonh.com/) distinguishes dining-room hours from overall venue hours. The obscured email was not guessed.
- [Northwoods contact page](https://northwoodswmnh.com/contact-us/) publishes a general email; no phone was invented.

FSP’s pages disagree about some Instagram handles, and one TikTok-labeled link points to Instagram. Those ambiguous destinations were not promoted as verified official accounts. Official Facebook, X and YouTube links come from the social page; Discord/Telegram are labeled FSP-listed community destinations, with no claim of FSP ownership. Existing imported short/internal chat URLs are retained, not silently replaced or claimed tested. Neither calendar resource listing is deleted; consolidation/parent-resource relationships require a URL-preservation decision. Calendar synchronization is unchanged.

`server/enrich-cli.ts` consumes an explicitly reviewed local JSON file; it is host-only, not a public API. It checks exact ID/name/version, applies the entire batch transactionally, merges rather than discards existing connections, and records content plus reference sources in one revision. A stale record rolls back the batch. The public API cannot forge source-check metadata. Later material edits clear the currently displayed additional references (their previous evidence remains in revision history), avoiding stale citations appearing to validate new claims. Imports cannot overwrite locally enriched entries. Research is not a review/confirmation badge.

After backup and human inspection, copy the specific research file into the app container, then run `node dist-server/server/enrich-cli.js /tmp/reviewed-enrichment.json` there. Do not rerun a dated file with modified revision numbers just to force it through: check source changes and current edits first. The operation is not automatically applied on startup or deployment.

Future automatic enrichment needs domain/URL safety, redirects and private-network protection, bounded requests, source permissions, recency checks, a review queue, conflict handling, and field-level evidence. Public pages are untrusted data, not instructions to an agent. Do not harvest personal numbers, emails, biographies, or private community content.

## Future discussion only: evolving communities

Explore how a Signal conversation might later support a group, recurring events or a larger organization while retaining its identity, connections and history. This is not a prescribed ladder: a channel can remain a channel. Discuss related entries versus category changes, multiple maintainers and consent, opt-in organizing tools, and what community support is useful without becoming social media. No automatic evolution, social graph, member monitoring or growth scoring is implemented.

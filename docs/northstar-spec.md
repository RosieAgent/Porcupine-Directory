# Porcupine Directory — Northstar and MVP specification

Status: draft v0.1, September 2026

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

A visitor can:

1. Browse and search a structured directory of groups, channels, businesses, and resources.
2. Filter by type, access model, location, and tags.
3. Open a listing and see its description, links, access instructions, source, and freshness.
4. See upcoming events sourced from the approved FSP Community Calendar feed.
5. Submit a new or corrected listing without creating an account; submissions are queued for review.
6. Save local-only interests or pinned listings in the browser without a server-side identity.

An editor can:

1. Import the source document after an export is supplied.
2. Review, edit, approve, archive, and attribute submissions.
3. Run the FSP event sync after feed access and permission are confirmed.

## Explicit non-goals for v0.1

- No required login for browsing.
- No public people wiki.
- No AI agent reading Signal or other private channels.
- No user-to-user messaging or social graph.
- No marketplace transactions or payment handling.
- No automatic publication of user submissions.
- No collection of legal names, phone numbers, precise location, or behavioral tracking by default.

## Core information model

### Listing

`group | channel | business | resource` with a name, summary, description, URL(s), tags, location at a coarse level, access mode, access instructions, source, review status, and last-confirmed timestamp.

### Access mode

`open`, `public`, `invite_only`, `private`, or `unknown`. The interface should explain the difference in plain language and never imply that an invite-only group is open.

### Event

An event has a source event ID, title, description, start/end time, venue, city, source URL, and sync metadata. FSP calendar events are read-only in the MVP; community-added events can be considered after a moderation flow exists.

### Submission

The public add form creates a pending record. A submission should be usable without an account, but it must not become publicly visible until a trusted editor approves it. Rate limiting, bot protection, and abuse reporting are production requirements before opening submissions broadly.

## Privacy and trust principles

1. Browse first; account second. Core discovery never requires a login.
2. Prefer local-only preferences. Favorites and topic interests default to browser storage.
3. Minimize metadata. Store only what is needed to publish and maintain a listing.
4. Consent before profile features. A future Who’s Who is opt-in, editable, revocable, and separate from ordinary directory participation.
5. Human review for sensitive content. No automated agent should publish claims about people, events, sales, or groups without an explicit review policy.
6. Source transparency. Show where a listing came from and when it was last checked.
7. Respect channel boundaries. Signal, private group, and member-only content must not be ingested without permission from the channel owners and affected participants.

## Future opportunity areas

- Opt-in alerts for selected topics, regions, or event types.
- Nostr as an optional identity or verification path, never as a requirement.
- Anonymous or pseudonymous contribution with abuse controls that do not require a public identity.
- A consent-based builder profile / Who’s Who with approval, preview, revision, and removal workflows.
- A moderated Buy/Sell board with clear rules, expiration, and no escrow.
- Human-in-the-loop source assistants that summarize permitted public feeds into review drafts.
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

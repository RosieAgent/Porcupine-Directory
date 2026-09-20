# Recipient-accepted maintenance ownership (item 5)

**Current policy:** see [staff sessions and owner dialog](staff-session-and-owner-dialog.md). The preview now uses session-only staff authorization, a staff-only account picker and an optional private No account label. The older verification/exact-username UI description below is historical; recipient acceptance, revocation and audit safeguards remain.

This change supplies new modules only. The main integration task supplies the
existing application entry point, navigation and migration-runner wiring below.

## Wiring contract

- `server/index.ts`: import `{ ownership }` from `./routes/ownership.js` and mount
  `app.use("/api/ownership", ownership)` after the shared `/api` session/account,
  origin and CSRF middleware, before the API fallback/error handlers.
- `server/migrate.ts`: register `011_ownership.sql` after `010_tags.sql` (ownership
  itself depends on the accounts/listings schema, not on the tag catalog).
- `src/App.tsx`: add `/account/assignments`, lazy-loading the default export of
  `./pages/OwnershipPage` within the existing layout/auth providers.
- Account navigation: link to `/account/assignments` as **Ownership assignments**.
- `src/pages/EditListingPage.tsx`: import `{ OwnershipAssignment }` from
  `../components/OwnershipAssignment`; render
  `<OwnershipAssignment listingId={id} version={listing.version} />` outside
  `ListingForm` so its nomination form is not nested in another form. The component
  handles staff visibility and verification; an outer `permissions.data?.canReview`
  guard is also appropriate.

## Policy and API

Only currently authorized editors/administrators propose or cancel assignments.
Nomination requires saved staff recovery information and the configured recent
staff authentication policy. The exact normalized private username is submitted
with the saved listing revision and an audit reason; no account-list/search API
is added. Staff may assign an unowned entry, but anonymous submitters and ordinary
owners gain no self-claim/nomination endpoint.

| Endpoint under `/api/ownership` | Access and result                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /inbox?page=1`             | Current account's paginated offers; no account names/IDs or staff reasons          |
| `GET /listings/:id`             | Verified staff only: current private owner username, version and pending recipient |
| `POST /listings/:id`            | Verified staff; `{ username, version, reason }`; returns `{ id }` with 201         |
| `POST /:id/accept`              | Exact authenticated recipient only; recent password verification                   |
| `POST /:id/decline`             | Exact authenticated recipient only                                                 |
| `POST /:id/cancel`              | Currently verified staff, including a different authorized staff account           |

The seven-day expiry is set by the database. A partial unique index allows one
pending proposal per entry. Cancellation/decline release the slot; proposing again
also resolves any expired pending record with an automatic audit event. GET views
show expiry without modifying records. Expired, cancelled, declined, accepted and
revoked offers cannot be accepted or replayed. A stale proposal becomes `revoked`
when acceptance discovers changed authority or entry state; staff may cancel a
still-pending stale proposal before replacing it.

Pending offers never modify `owner_id` or grant permissions. Acceptance locks account
rows in UUID order, then the listing and offer. It rechecks the requester's current
session version; the proposer's role, suspension, recovery-saved flag and recorded
session version; and the listing's prior owner, version and publication status.
It checks expiry after acquiring the locks. These checks serialize acceptance with
edits, role/session revocation, cancellation and other acceptances. Ownership does
not acquire the tag advisory lock or change tags; account locks precede listing locks.
Nomination also locks the prior owner's account before the listing, because its
foreign key otherwise risks a lock cycle with an owner edit's current-session lock.

The recipient must have verified their password within 15 minutes, through sign-in
or the existing `/auth/reauthenticate` endpoint. Signup/activation/recovery or a
passkey-only session is not sufficient password verification. Accepting is explicit
and separate from reauthentication. Recipient recovery setup and staff passkey
enrollment are not required for this entry-specific consent. Proposer verification
is required at nomination, not continuously for seven days: normal expiry of their
15-minute verification window does not invalidate an offer. Role/security changes
that advance their session version do invalidate it.

Acceptance changes only private maintenance ownership and its related metadata:
one new listing revision, `locally_edited=true` (preserving assignment against
imports), and explicit clearing of **all three** timestamps: `self_confirmed_at`,
`editor_reviewed_at`, and `last_confirmed_at`. An owner-only update does not trigger
the existing content-change badge reset, so the route clears these itself. No
previous owner's confirmation or review carries into the new ownership. Listing
content, publication status and account roles remain unchanged. The previous owner
loses owner-derived edit/confirm access; independently authorized staff retain
their staff editing access. Existing content restore never restores ownership.

Ownership and usernames remain private. Public listing responses are unchanged;
the recipient inbox contains only invitation/listing metadata. Mutation/query
caches use account-scoped private keys. Responses from this router use `no-store`.
Audit records use internal UUIDs: proposer for nomination, recipient for acceptance
or decline, acting staff for cancellation, and NULL for automatic expiry/revocation.
The acceptance listing revision records the actual recipient actor and before/after
owner IDs. Fixed audit actions/cause codes contain no passwords, tokens or session
IDs; the private nomination reason is stored once on the offer, not copied into
public fields. No host impersonation or host ownership repair is introduced.

## Isolated verification

Run `node --import tsx tests/ownership.integration.mjs`. It uses `TEST_DATABASE_URL`
or the existing localhost fixture database default, creates a randomly named
`ownership_test_<uuid>` schema, uses only that search path, and drops that exact
schema in `finally`. No production records, settings, deployment or CI changes are
needed. It mounts the real middleware/auth/listing/ownership routers on an ephemeral
loopback port, independently of pending main-app wiring. Migration 010 is included
because the real listing restore route now reads the tag catalog.

Coverage includes explicit recipient consent, private exact lookup, ordinary-user
and anonymous denials, current-owner retention, replay/CSRF/origin protection,
all confirmation resets, private audit actors, content restore, all terminal states,
expiry slot reuse, stale owner/status/revision, proposer role/suspension/recovery/
session changes, recipient session and recent-password checks, staff auth policies,
and concurrent nomination/accept/cancel/edit/session revocation. Race tests hold
fixture row locks and wait for the acceptance request to block before changing state.

Optional realistic browser preview:
`OWNERSHIP_BROWSER=1 node --import tsx tests/ownership.integration.mjs`.
This also starts Vite on an ephemeral loopback port with API requests proxied only
to the disposable fixture server. It drives the wired application with Chromium:
staff nomination/cancellation, private recipient inbox, required explicit consent,
incorrect/correct password verification, and acceptance. It checks accessible
icon-only actions, keyboard activation, tooltips and mobile overflow. Screenshots
are written to a randomly named `/tmp/ownership-preview-*` directory whose path
is printed on completion. The pictured Concord Makers Exchange and all accounts
are fictional fixtures; all database records are removed on exit.

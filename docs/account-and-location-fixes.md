# Account ownership, deferred authentication and NH location selection

## Delivered

- Passkey controls and references are hidden by default (`PASSKEYS_ENABLED=false`) on login, activation, account/security and staff pages. The matching API routes return 404 when disabled; the implementation remains available for a future opt-in release. Existing credentials are not deleted by toggling the feature.
- **Superseded by owner approval:** v0.1 now uses password verification within 15 minutes for staff actions, without an additional passkey. Roles, recovery suspension and audit remain. See [staff setup](staff-preview-setup.md). The UI feature switch alone never changes security policy.
- The local directory now has a persistent, private session secret. Previously every app restart generated a different secret, invalidating sign-ins. The first deployment of this fix requires signing in again once; subsequent restarts reuse the key.
- Submission includes the account identity displayed by the form. The server compares it against the authenticated session and rejects expired, signed-out or different-account sessions before insertion. Anonymous submission is still allowed, but cannot be silently substituted for an account-owned submission. The database transaction also rechecks current session version.
- One specifically requested ownership repair: `Test Group (Delete Me)` (`ed2ba998-4cbe-4734-a436-b530dab9a301`) was created with neither owner nor signed-in audit actor. Its actual cause cannot be proven from that record. The host assigned it to the exact requested account `test-user` with a new `host-owner-repair` revision, retaining the anonymous creation record. No automatic claiming endpoint or general ownership transfer workflow was added.
- Owners may edit and remove their own entries. Removal uses the existing archived status: public browsing/detail routes no longer show the entry, but My entries and private revision history retain it. Removal requires a reason, confirmation and current revision. Owners cannot use it to publish pending or previously moderated entries; publication remains an editor action. This is not erasure of historical data.
- Community stage `unknown` is presented as **Not sure yet**: whether it already exists is unknown. Existing means operating now; Idea / proposed means a proposed future community. Missing joining information does not imply an idea.

## Location catalog

Bundled snapshot of the [NH DOT / GRANIT Towns layer](https://maps.dot.nh.gov/arcgis_server/rest/services/Boundaries/NHDOT_BOUNDARIES_Towns/FeatureServer/2), checked September 19, 2026 UTC: 259 named town/city/unincorporated-place records with stable source IDs and counties. Broad options include ten counties, statewide New Hampshire, and seven tourism regions named by [Visit NH](https://www.visitnh.gov/things-to-do/scenic-drives). This is not a claim of 259 incorporated municipalities. Source names are retained with each place; no tracking, runtime geocoding or GPS collection is involved.

MUI searchable selectors serve both forms and filters. New entry locations must come from the catalog or remain blank; case-insensitive town names and NH suffixes normalize to one display label. New unrecognized values are rejected server-side. An existing uncatalogued location is retained and can remain unchanged during editing rather than being silently erased. Shared old filter URLs still work, including lower-case town names.

For v0.1 an entry has **one** selected area. Filtering matches that selected area, not nearby towns, inferred region membership, or every NH entry when statewide is selected. Multiple service/coverage areas, regional containment queries and additional community-defined regions are future work. Catalog IDs prepare for that future migration; current listing storage and shared URLs continue using canonical labels.

## Email and operational follow-up

Email recovery retains encrypted addresses, one-use codes, revocation/removal and non-enumerating responses. The owner selected local-only SMTP preview, now tested through Mailpit; no external recovery mail is sent. See [email setup](email-recovery.md).

Backup before ownership repair: ignored private `data/backups/pre-account-fixes-C7iXKZ/database.dump`. The directory's private `.env` holds persistent session/email encryption keys; never commit, log or include it in Docker build context. No Rosie Studio configuration or services were changed.

## Checklist

- [x] Hide/defer passkeys without weakening the staff authorization gate.
- [x] Repair the named test entry's ownership with audit coverage.
- [x] Prevent stale-session anonymous submissions and keep My entries cache refresh.
- [x] Allow owners to remove their own entry with retained history; no hard deletion or owner publication bypass.
- [x] Clearer community-stage label/help.
- [x] Searchable canonical NH area selection and case-insensitive filters.
- [x] Persistent local keys; safe SMTP diagnostic; email delivery-failure handling.
- [x] Approve and implement the v0.1 recent-password staff policy.
- [x] Configure and test local-only SMTP preview as requested; external provider/sender selection is deferred.
- [ ] Future: multiple coverage areas, region containment and editor-managed location additions.

Validation: production build, strict TypeScript, lint, formatting, seven unit-test files and all 46 browser checks passed. Isolated authorization/email/history tests passed, including stale identity rejection, case-insensitive location filtering, owner archiving without publication bypass, disabled passkey endpoints, and failed email delivery preserving a verified address. The opt-in passkey path remains covered in the disposable schema. App/database containers are healthy; mocked-account security and live location-selector screenshots were visually reviewed with no page errors. The SMTP diagnostic correctly reports configuration incomplete; no real email was sent.

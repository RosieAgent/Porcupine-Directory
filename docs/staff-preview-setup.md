# Approved v0.1 staff policy and local email preview

The owner explicitly approved password sign-in/reverification within 15 minutes for editor/admin actions, replacing the passkey requirement for v0.1. This removes the additional passkey protection; it is not represented as MFA. Passkey UI/API remain disabled, with the old policy still covered in isolated tests.

`STAFF_AUTH_MODE=password_recent` explicitly enables this policy. Unknown/missing values fail closed to the preserved passkey policy; `PASSKEYS_ENABLED` alone never weakens staff authorization. A separate server session timestamp records successful password login/reverification. Signup, invitation activation, recovery and password replacement do not mint fresh staff verification. Ordinary requests do not extend the window, and future timestamps are rejected. Reverification rotates the session identifier, is CSRF/origin/rate-limit protected and audited. Account-security changes keep the five-minute boundary.

Roles, saved-recovery prerequisites, session-version checks, role-change invalidation, private entry ownership and privileged recovery suspension remain enforced server-side. Password re-entry cannot restore suspended privileges. Reapprove editors through an administrator; restoring administrators requires the host console. The staff interface offers a current-password prompt without passkey references.

Administrator account management now includes a searchable/paginated private user list with only username, identifier, role and setup/recovery/suspension state. No emails, credentials, recovery material or saved entries are returned. Editors cannot access that list or assign roles. Existing exact-username editor grant/revoke is retained; administrator promotion remains host-controlled.

The owner's chosen account was reserved using a private 24-hour one-use setup invitation, with no chosen/default password and no activation consumed by the assistant. A local file in a mode-700 Git-ignored directory contains the link and instructions; the file is mode 600. The owner chooses a password, saves the phrase, verifies their password and opens `/admin` or `/editor`. Setup tokens are stored as hashes and roles are server-bound. If expired, renew only the pending invitation via `setup-cli`; never overwrite an activated account.

## Local recovery mail

Activation status: a subsequent read-only check confirmed the owner's account is now an active administrator with recovery marked saved and no pending setup token. The consumed invitation is not reusable; do not renew or reset the activated account. Enter the current password on `/admin` when verification is needed.

The separate Mailpit service is pinned to `v1.31.1` and available at **http://localhost:8027**. It has no public-interface binding, SMTP host port, relay/forwarder or persistent mail volume. Messages are limited to 100 and expire after one hour. It is not Rosie Studio's inbox. Anyone with local inbox access can read these test codes; use test addresses and do not treat preview email as an independent production recovery method.

Local `.env` uses `SMTP_MODE=preview`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025` and a project-local placeholder sender. Plain SMTP is allowed only for this exact service with a loopback app origin and no SMTP credentials. Public SMTP continues requiring TLS and normal certificate validation; a nonlocal deployment with preview mode fails closed. Existing encryption/session secrets were preserved.

Start with `sudo docker compose --profile mail-preview up -d app mailpit`. There is no real outbound mail delivery. Do not expose this inbox on Hostinger. Choose a real project-specific sender/provider separately before production, disable preview and use TLS SMTP.

Reference: [Mailpit Docker configuration](https://mailpit.axllent.org/docs/install/docker/) and [runtime controls](https://mailpit.axllent.org/docs/configuration/runtime-options/). Reauthentication follows the principles of [OWASP's authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html); the selected time limits and lack of MFA are explicit project decisions, not claims of security certification.

## Donation configuration

Bitcoin is **TBD**, with no wallet URI or copy action. The user supplied `csmathguy@strike.me` for Lightning. Its public LNURL-pay metadata returned a `payRequest` from Strike during setup; no invoice was requested and no payment made. This verifies endpoint availability, not independent proof of wallet ownership. The app offers direct wallet handoff/copy and does not fetch invoices or publish Nostr zap receipts. A future NIP-57 flow still needs separate recipient-key/receipt-policy implementation.

## Verification

Build/typecheck, all ten unit-test files, lint/format checks, isolated password-staff and preserved passkey/auth/history tests, real local SMTP verification/recovery and all 53 browser checks passed. Two fixture messages were generated in Mailpit and expire automatically; no external message or payment was sent. The final two researched business updates preserve original links/IDs and remain unconfirmed. The directory app, database and local preview inbox are separate from Rosie Studio.

`tests/staff-auth.integration.mjs` uses a disposable schema to cover private activation, saved-recovery gating, recent-password expiry, roles, admin-list privacy, revocation and recovery suspension. With `TEST_MAILPIT_API=http://mailpit:8025` inside the preview network it also tests real SMTP verification and one-use email recovery using disposable fixture accounts. Only fixture messages are generated; they expire automatically. Existing passkey/auth/history tests remain separate. No real account is signed into or password/recovery secret chosen by the assistant.

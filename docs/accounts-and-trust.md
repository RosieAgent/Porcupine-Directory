# Accounts, authorization, and trust — v0.1

Current deployment: approved `STAFF_AUTH_MODE=password_recent` requires password login/reverification within 15 minutes for staff actions and five minutes for account-security changes. Passkeys stay hidden. Roles, audit, saved-recovery prerequisites, revocation and recovery suspension remain. Administrators can browse, edit and delete eligible non-administrator accounts from the web application; the existing global `editor` role is presented there as monitor access. Local-only mail preview is available. See [staff setup](staff-preview-setup.md).

## Product decisions

Browsing and anonymous submission never require an account. New entries are published **unconfirmed** by default. Anonymous submitters cannot edit later; account submissions have private ownership. No automatic claiming of imported/anonymous entries. Public responses omit owner IDs and usernames. The optional alias defaults to Anonymous; public author profiles are not part of this release.

Three independent dimensions:

| Dimension    | Values                                         | Who changes it                                    |
| ------------ | ---------------------------------------------- | ------------------------------------------------- |
| Visibility   | published / pending_review / archived (hidden) | Submission policy; global editor/admin            |
| Confirmation | unconfirmed / self-confirmed, with date        | Account owner explicitly attests to saved content |
| Review       | not reviewed / editor-reviewed, with date      | Global editor/admin                               |

Self-confirmation and editor review can coexist. A material content change clears both badges; restores also clear them. These are dated attestations, not promises of accuracy. Amber question-mark, person, and review icons include accessible names and explanatory tooltips. Imported timestamps are not confirmations.

Default discovery first places entries with joining/contact details above those missing them, across the full result set before pagination. Within each group it uses confirmation-first ordering: both recent checks, editor review, owner confirmation, neither; alphabetical within each tier. Checks older than 180 days show recheck icons and lose their boost. These are role-based signals, not necessarily independent opinions (an owner may also be an editor). Source research and clicks/bookmarks never boost confirmation rank. Alphabetical/recent-update sorting remains available within the same completeness groups. See [the complete ordering and enrichment policy](ranking-and-enrichment.md), mirrored publicly at `/about#listing-order`.

My entries includes an icon-link to create an entry even when the account has no entries. It opens the existing signed-in submission workflow, preserving private account ownership and later editing rights. This does not implement assignment of existing anonymous/imported entries.

`SUBMISSION_POLICY=published` is the default. Change to `pending_review` and restart the app to hold new submissions. Existing entries do not change automatically. Editors can publish or hide individual entries. No editor scopes in v0.1; category/geographic scopes are explicitly future work.

## Credentials and recovery

Password-setting forms (registration, invitation activation, phrase/email recovery and signed-in replacement) require an exact re-entered match, without trimming or normalizing either value. Confirmation is client-side typo prevention, never transmitted or stored; the server still validates password policy independently. Sign-in keeps a single current-password field. The header exposes sign-in while signed out and account/sign-out while signed in, without publishing a username. Pending/failed session checks do not pretend the visitor is signed out; failed logout remains visible and retryable.

- Signup: private normalized username (3–32 letters, numbers, punctuation or symbols), password (15–128 characters), optional alias. Usernames are Unicode NFKC-normalized and case-insensitive; spaces, invisible/control characters are rejected. Passwords already accept punctuation and spaces. No legal identity, phone, birthday, address or mandatory email.
- Passwords and generated application-specific recovery phrases use Argon2id verifiers (19 MiB, two iterations). Signup offers 12 or 24 words. Recovery generates a new 12-word phrase, invalidates the previous one, and displays it once. Never use a cryptocurrency seed or Nostr secret.
- Passkeys use SimpleWebAuthn: origin/RP binding, required user verification, discoverable credentials, single-use five-minute challenges and signature-counter checks. Registration requests no identifying attestation. Account signup currently starts with a password; passkeys can then be added and used for subsequent sign-ins.
- Staff actions use the configured server-checked policy: approved recent-password verification in v0.1, or preserved opt-in passkey verification. Security changes require verification within five minutes. No TOTP implementation.
- Phrase/email recovery rotates credentials, removes passkeys, revokes sessions and suspends staff access. Reapproval requires a saved phrase; a passkey is required only under that policy. Administrator restoration uses the host console. Password re-entry cannot clear suspension.
- Add a backup passkey. Individual passkey naming/removal and a device/session management screen are future enhancements. “Sign out all devices” works now. Lost passkeys can be invalidated together through recovery.
- Email recovery is optional and disabled without this project's SMTP configuration. After signup, add it in Account security. A 15-minute, single-use emailed code must verify the address before it becomes a recovery method. Addresses use AES-256-GCM with a separate environment key; random email codes are stored only as SHA-256 digests. Recovery codes are entered into the site, never put in URLs. Removing email deletes pending codes too. The site operator and mail provider can access mail; encryption is not anonymity or end-to-end encryption.
- Account recovery requires the username plus a working credential, phrase, or previously verified email. No identity-based override or secret questions. Nostr and credential linking remain future work.

## Administrator setup on this machine

1. Open **http://localhost:4350/register**. Choose your own username and password; save the generated recovery phrase. Do not send secrets through chat.
2. Save the recovery phrase and sign in with your password for the approved v0.1 policy. The preserved passkey policy requires explicitly enabling and registering/verifying that feature first.
3. From a trusted workstation, run the host-console promotion helper, replacing `YOUR_USERNAME` with that exact username:

   ```bash
   ssh -i ~/.ssh/porcupine-directory-production \
     -l porcupine-deploy VPS_IP \
     'bash -s -- YOUR_USERNAME' < deploy/promote-admin.sh
   ```

4. Sign in again with your password. Administration can browse/search accounts, edit private usernames/display names, grant/revoke monitor access, and delete accounts that have no ownership or moderation records. Recipients must save their recovery phrase. Role and account changes invalidate affected sessions. Administrator accounts remain host-managed.

The first public signup is **never** made administrator. No default password, shared admin key, email identity or account was created for the owner. Host console promotion/restoration writes an audit event. Protect host access and backups as root-of-trust credentials.

### Host-issued setup invitations (new accounts and role testing)

Alternatively, reserve an exact username and issue a one-use invitation from the trusted host:

```bash
sudo docker compose exec -T app node dist-server/server/setup-cli.js 'YOUR_USERNAME' administrator
sudo docker compose exec -T app node dist-server/server/setup-cli.js 'test.user' user
sudo docker compose exec -T app node dist-server/server/setup-cli.js 'test.editor' editor
```

The command prints a private 24-hour one-use setup URL. Its holder can activate the reserved account: choose a password, save the phrase and verify the password under Account security. Roles are host-bound, never accepted from public requests. Pending accounts have unusable random credentials and no elevated role. No email/default/shared password is required.

Only a SHA-256 token digest and expiry are stored. Activation consumes the invitation transactionally, generates fresh credential verifiers, regenerates the session and records a credential-free security audit event. The browser removes the URL fragment immediately; it is not sent to the server in the page request. The activation page deliberately has no share action. Do not put invitation links into source control, public screenshots or chat channels. Use different browser profiles/private windows when comparing roles; anonymous testing needs no account.

To replace an expired or lost **pending** invitation, invalidating the previous link:

```bash
sudo docker compose exec -T app node dist-server/server/setup-cli.js 'test.editor' --renew
```

Neither command overwrites an activated account. Existing administrators use the promotion/restoration command above after normal account recovery. Pending reservations persist until activation (including expired ones); host renewal preserves their intended role. Provisioned test accounts use real authorization rules and must be removed or deprivileged before public launch. Test entries are real entries: use the isolated automated test schema for destructive tests. Local setup links for this session live in the ignored, restricted `data/account-setup/` directory, not this document.

## Audit and import behavior

Database triggers capture initial listing baselines and each later revision, with before/after snapshots, version, actor UUID (or anonymous/service), action, timestamp and reason. The content write and revision insert are one transaction. Editors can inspect paginated history and preview a field comparison before restoring an old content snapshot as a **new** revision. Optimistic version checks reject stale edits/restores (409); restore does not change ownership, publication state or old trust badges.

Directory imports generate source-attributed revisions and skip unchanged rows. Once locally edited, confirmed, reviewed or moderated, an imported row is protected from later imports. This is a whole-entry override, not field-level merging; reconciling upstream changes is future work. Stable source keys/URLs remain in revision snapshots. Event-source content changes and cancellations also generate database revisions; routine sync timestamps alone do not. Events remain source-managed; event history/restore UI is not provided yet.

Security audits record account creation, role assignment, recovery, credential and email changes using internal IDs, not secrets. `/api/admin/audit` is administrator-only and paginated. Bookmarks never enter content revision history. Application routes do not update/delete audit rows, but a database owner can: these logs are **not tamper-proof**. The production Compose override uses a one-shot migration owner and a restricted runtime role; verify those roles and the backup controls before launch. Sensitive-content redaction and account deletion/export need an explicit retention workflow before public launch; do not store private information in entries or revision reasons.

## Sessions, privacy and deployment

- PostgreSQL-backed opaque session cookies: HttpOnly, SameSite=Lax, seven-day lifetime; Secure and `__Host-` prefix on HTTPS. No bearer tokens or credentials in local storage. Sign-in regenerates the session ID. Every request reloads account role/session version; recovery/role changes invalidate old sessions.
- Synchronizer CSRF tokens plus origin checks protect mutations, including signup and anonymous submission. Public browsing creates no session cookie until needed. Private API responses use `Cache-Control: no-store`.
- PostgreSQL rate buckets enforce signup, sign-in, recovery, passkey and submission limits across replicas. Buckets contain HMAC-derived network/account keys, not raw IPs. Expired buckets/challenges/email codes are cleaned on subsequent limited requests. Without traffic, expired records can remain until the next cleanup. Reverse-proxy logs are a separate deployment responsibility.
- Anonymous bookmarks remain browser-only. Signed-in bookmarks synchronize privately, with no automatic upload/merge of browser bookmarks. Other users/editors cannot request another account's bookmarks. Database operators still have access; this is not end-to-end encrypted.
- Configure `APP_ORIGIN` to the exact canonical HTTPS origin before public use, and a persistent random `SESSION_SECRET` (at least 32 characters; recommend 48 random bytes). Without one, localhost uses an ephemeral secret and app restarts sign everyone out. Passkeys bind to the hostname: localhost passkeys do not migrate to your future public domain.
- For Vite development, use `APP_ORIGIN=http://localhost:5173` for the backend. Public deployments refuse non-HTTPS origins or missing/short secrets. Enable `TRUST_PROXY=1` only behind exactly one trusted proxy with the application port inaccessible directly. Configure a private-network TLS termination path appropriately.
- Optional SMTP: `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465 TLS), `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`, and a separate `EMAIL_ENCRYPTION_KEY` (32 random bytes, hex). TLS is required; debug mail logging is disabled. Back up the encryption key securely; losing it makes existing recovery addresses unusable. No SMTP provider has been configured or live messages sent during implementation.
- This loopback Compose setup is not a production deployment. Before launch: replace development DB credentials, verify the production role separation, configure TLS and persistent secrets, establish encrypted/restorable backups, define the abuse/reporting process and retention/redaction policy, complete a restore drill and independent security review, and verify Hostinger supports this container stack.

## Verification and references

`npm run test:auth` builds and starts a disposable localhost:4351 test server with a random database schema. It tests APIs and Chromium's virtual passkey authenticator, then removes only that schema. Requires this project's development DB and `/usr/bin/chromium`. Do not run against a production DB.

Implementation references: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP account recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server), [Express sessions](https://expressjs.com/en/resources/middleware/session/), and [Nodemailer SMTP/TLS](https://nodemailer.com/smtp).

# Optional email recovery

The application supports setup, one-use verification, recovery and removal. Only a verified recovery address can recover an account. Addresses are encrypted at rest with AES-256-GCM; verification/reset codes are stored only as hashes, expire after 15 minutes and are never included in URLs or logs. Public recovery requests do not reveal whether an account exists. Recovery replaces credentials, revokes sessions and suspends staff privileges for explicit reapproval.

## Installation

Use a dedicated Porcupine Directory sender and mail account/service, not Rosie Studio's mail credentials. Put the provider's SMTP host, port, sender, username and password in this project's ignored `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`). Do not paste credentials in chat, commit them, or print Docker's resolved environment. Outbound delivery requires TLS: port 465 uses implicit TLS; other ports require STARTTLS. Do not disable certificate checks for a public provider.

`EMAIL_ENCRYPTION_KEY` must be persistent: 32 random bytes encoded as 64 hex characters. Back it up privately with `SESSION_SECRET`. Losing or replacing the email encryption key makes existing recovery addresses unreadable. A persistent session secret prevents app rebuilds from signing everyone out. The local private `.env` is mode 600 and ignored by Git and Docker's build context; Compose passes only the needed variables at runtime.

After configuring the chosen provider, recreate only the directory app. Run `node dist-server/server/mail-check-cli.js` inside that app container. This checks SMTP TLS/authentication without sending a message or exposing credentials. It cannot prove mailbox delivery or spam-folder placement.

Sign in again, open Account security, enter an address you control, and request a verification code. Enter the received code to activate recovery. Then use Recover account → Verified email for an end-to-end recovery test on a disposable test account. Recovery resets the password and recovery phrase; do not casually test it on your administrator account. Keep the new phrase even if email is enabled.

## Current installation status

Persistent keys are preserved. The owner chose local email preview, available at http://localhost:8027 in this project's separate Mailpit service. Verification and one-use recovery passed real local SMTP tests with disposable accounts. No external email is sent. Preview messages expire after one hour; anyone with local inbox access can read the codes. Use test addresses, not production recovery expectations. See [current setup](staff-preview-setup.md).

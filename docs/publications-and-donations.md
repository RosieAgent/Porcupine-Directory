# Public media and donation setup

## Current behavior

The Porcupine Report detail page shows up to six recent titles and publication dates from [the publisher RSS feed](https://anchor.fm/s/72228cd4/podcast/rss). Its publisher identity was cross-checked against [FSP's show page](https://www.fsp.org/porcreport/), [official social links](https://www.fsp.org/connect/social-media/) and [Apple's podcast directory](https://podcasts.apple.com/us/podcast/the-porcupine-report-with-eric-brakey/id1733138512). The feed includes occasional special editions, not only numbered episodes. Titles link to publisher episode pages; videos are available through the channel and show playlist. This is not a complete YouTube uploads integration.

YouTube's official channel metadata supplied channel ID `UCGpPjaE3IwGOE8DpDrJtMvg`, but both its channel feed and the show's playlist feed returned HTTP 404 during this check. Do not scrape channel recommendations or use the first channel ID in page HTML as the owner ID. A future YouTube API adapter requires a separate configuration/quota decision. See [YouTube feed documentation](https://developers.google.com/youtube/v3/guides/push_notifications).

The server checks RSS hourly, with a persisted attempt timestamp and PostgreSQL advisory lock to prevent duplicate workers. A lightweight scheduler checks whether it is due every minute. Reads never trigger external fetches. Cache survives app rebuilds, contains six public titles/URLs/dates only, and is retained on failure. There is no feed URL submission endpoint. The fixed URL forbids redirects; responses have a 15-second deadline and 2 MB decompressed limit. DOCTYPE/entities, unrelated feeds, future/invalid dates and unsafe destinations are rejected. No feed HTML, images or media are rendered. Set `PUBLICATION_SYNC_ENABLED=false` to pause polling; cached results are labeled accordingly.

Publication recency is not human confirmation, does not change ranking, and does not grant a trust badge. No listening history or notifications are collected/sent. User bookmarks remain private.

## Activate donations

Route: `/donate`. Bitcoin is TBD with payments disabled. The owner-supplied Lightning Address is configured and its public LNURL-pay metadata was checked. No invoice or payment was created. See [current setup](staff-preview-setup.md).

Set only **public receiving destinations** in this project's ignored `.env`:

```dotenv
DONATION_BITCOIN_ADDRESS=
DONATION_LIGHTNING_ADDRESS=
```

- Bitcoin: a mainnet receiving address belonging to the project owner. `bitcoinjs-lib` checks its network/format/checksum before exposure. Wallet handoff uses a [Bitcoin URI](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki), with no preset amount or automatic transfer. No private keys, seeds, signing or custody.
- Lightning: an owner-controlled **Lightning Address**, `name@provider.example`, not an email inbox. The app encodes its HTTPS `.well-known/lnurlp/name` endpoint as LNURL for wallet handoff. It does not fetch the endpoint, generate invoices, process receipts or claim a donation succeeded. Only syntactic validation is automatic; verify the provider supports LNURL-pay and the receiving identity belongs to you before enabling. Raw LNURL strings and expiring invoices are not accepted in this config version.
- Recreate this project's app container after changing settings. Invalid/blank values remain disabled rather than showing an unsafe payment destination. Never put wallet secrets into these fields, screenshots, Git, tickets or chat.
- Confirm the displayed address against your wallet on both desktop and mobile, check wallet-handler compatibility, and authorize any real test payment yourself. No real payments were initiated during development.

No email, donor identity, browser wallet connection or account is required. Bitcoin is public; address reuse can link donations. Wallets/Lightning providers have their own metadata exposure. No anonymity guarantee. No donor leaderboard, analytics or ranking advantage. No tax deductibility claim.

## Self-host the Lightning Address

The application can also serve its own LNURL-pay endpoint for a Lightning Address on the same HTTPS domain. This mode creates a fresh invoice through the project's Alby Hub connection when a wallet requests payment. It does not require an Alby Account.

Use a project-owned address whose domain matches `APP_ORIGIN`, for example:

```dotenv
DONATION_LIGHTNING_ADDRESS=donate@porcupinedirectory.com
DONATION_LIGHTNING_NWC_URL=<restricted-Alby-Hub-NWC-connection-secret>
# The direct-LND values below are an alternate backend; leave them blank when
# using NWC.
DONATION_LIGHTNING_LND_REST_URL=https://lnd.private.example:8080
DONATION_LIGHTNING_LND_MACAROON_HEX=<invoice-only-macaroon-hex>
DONATION_LIGHTNING_LND_TLS_CERT_B64=<base64-of-lnd-tls.cert>
DONATION_LIGHTNING_MIN_MSAT=1000
DONATION_LIGHTNING_MAX_MSAT=1000000000
DONATION_LIGHTNING_EXPIRY_SECONDS=3600
DONATION_LIGHTNING_MEMO=Porcupine Directory donation
```

Prefer a dedicated Alby Hub app connection for the donation sub-wallet with only `make_invoice` (and, if desired, `lookup_invoice`) enabled. Store its complete NWC connection secret only in the mode-600 production environment file; never commit it, paste it into chat, or place it in screenshots. The website can create invoices but cannot spend from that connection. If using the direct-LND fallback instead, the REST URL must travel over a private VPN or tunnel between the production web server and Start9. Do not port-forward LND's REST or gRPC port to the public internet. The macaroon should be limited to invoice creation (`invoices:write`), and the TLS certificate value is base64 only so it can safely pass through the environment file; certificate validation remains enabled.

The public endpoint is:

```text
https://porcupinedirectory.com/.well-known/lnurlp/donate
```

It returns public payment metadata. The callback creates the invoice; the site does not receive, hold, or sweep funds. Incoming liquidity and node availability still determine whether payments can complete. If the NWC/LND backend values are absent, the self-hosted endpoint is not registered; a provider-hosted address can continue to be displayed normally.

**Nostr zaps remain pending**, not synonymous with ordinary Lightning payments. [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) adds recipient/provider public keys and signed zap events/receipts. Choose the recipient and public/private receipt policy before implementing this; never silently link payments to directory accounts. Dash, Monero and USD remain future discussions.

## Checks

`npm test` covers parsing, bounded requests, destination checks and URI encoding. `node tests/publications.integration.mjs` tests hourly gating, concurrency, stale-data preservation and disabled-state metadata in a disposable schema. Browser coverage lives in `tests/resources-donations.spec.ts`; it uses read-only pages and intercepted fixtures, not real donations or new live entries.

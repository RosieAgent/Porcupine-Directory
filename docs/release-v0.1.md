# Porcupine Directory v0.1 release

Status: release candidate prepared September 20, 2026. The application and container checks pass; public deployment still requires the host and operational items below.

## What is ready

- The Northstar v0.1 visitor flows are implemented: anonymous browsing, search, shareable filters and detail URLs, typed connections, events, submissions, local bookmarks, optional private accounts, moderation reports and staff review.
- The current local database contains 284 published listings: 282 from the Porcupine source document and two additional maintained records. The source import completed successfully with 282 entries and no eligible listing changes.
- The FSP calendar source is available with a partial status because malformed recurrence rules are intentionally skipped and retained for review. The public UI discloses source status and coverage.
- The release artifact builds as a non-root Node container. Local preview migrations run at startup; production runs them in a one-shot migration container before the web process starts.

Run the application checks with:

```bash
npm run release:check
npm run test:sync
npm run test:auth
npm run test:browser
```

The full release verification completed locally on September 20, 2026: production build, TypeScript, ESLint, formatting, 54 server tests, event-sync integration, authentication integration, and 78 browser tests passed. The Docker image also built successfully and the recreated preview returned a healthy database-backed `/api/health` response.

## Production setup

Copy the example environment file, fill every required value, and keep it outside version control:

```bash
cp deploy/production.env.example .env.production
${EDITOR:-vi} .env.production
```

The production override removes host database exposure, requires a persistent HTTPS origin and session secret, and keeps the application bound to loopback for a host reverse proxy:

```bash
docker compose --env-file .env.production \
  -f compose.yaml -f compose.production.yaml config

docker compose --env-file .env.production \
  -f compose.yaml -f compose.production.yaml up -d --build

curl --fail https://directory.example/api/health
```

Use a reverse proxy that terminates HTTPS and forwards to the configured loopback application port. Set `TRUST_PROXY=1` only when exactly one trusted proxy sits in front of the application. Keep PostgreSQL inaccessible from the public network.

Before enabling public accounts, configure SMTP with a real TLS-capable provider and a separate `EMAIL_ENCRYPTION_KEY`, or leave email recovery disabled and make that limitation clear to operators. Verify the canonical host before creating passkeys; passkeys are bound to the public hostname.

## Required launch gates

These are operational gates, not application features that should be silently skipped:

1. Confirm the public domain, DNS, TLS certificate, reverse-proxy route and `APP_ORIGIN`.
2. Replace every development credential. Use a long random `SESSION_SECRET`, a separate owner connection for `ADMIN_DATABASE_URL`, a different runtime password for `APP_DATABASE_URL` and `APP_DB_PASSWORD`, and confirm that the web process starts with `RUN_MIGRATIONS=false`.
3. Create an encrypted backup policy, run a restore drill, and retain a known-good pre-release database dump. Do not store dumps in the repository.
4. Create the first administrator account through the trusted host console, save its recovery phrase, verify staff access, then verify editor access and session revocation.
5. Establish an abuse/report response owner and retention/redaction policy. Public submissions are published by default in v0.1; change `SUBMISSION_POLICY=pending_review` if the launch operator wants moderation before publication.
6. Confirm permission and operational contact for the FSP calendar data before public launch. The feed is read-only and source-attributed; malformed series remain visible to operators as skipped diagnostics.
7. Review public entries, joining instructions, contact fields, donation destination ownership and source attribution with the launch operator.
8. Run the browser suite against the production-shaped host, inspect mobile and desktop pages, and verify no private routes or account metadata are indexed.

## Rollback

Keep the previous image and a verified database backup. Roll back the application image first when the database schema is compatible. For a schema rollback, stop writes, restore the database backup to a separate database or verified maintenance window, and validate `/api/health`, anonymous browsing, sign-in and staff actions before reopening traffic. Never use `docker compose down -v` on a production database.

The base Compose file is intentionally suitable for local preview only. The production override removes database host exposure, separates migration and runtime database roles, and requires deployment-specific values; backups, reverse-proxy configuration and moderation operations still belong to the host operator.

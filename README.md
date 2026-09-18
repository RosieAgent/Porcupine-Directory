# Porcupine Directory

Porcupine Directory is a privacy-respecting community hub for finding New Hampshire groups, channels, businesses, resources, and events. Version 0.1 focuses on turning an overwhelming source document into a searchable, structured directory while keeping public use login-free.

## Current shape

- React + TypeScript + Vite frontend.
- Express + TypeScript API.
- PostgreSQL in Docker with an initial schema and full-text search index.
- Public browsing with no login.
- Public submissions enter a review queue instead of publishing immediately.
- FSP Community Calendar is modeled as the first event source; the sync endpoint is intentionally configured around an iCal URL so it can be enabled once the approved feed URL and terms are confirmed.
- Browser-only saved interests use local storage; the MVP does not require an account or collect a profile.

## Run locally

```bash
cp .env.example .env
npm install
npm run db:up
npm run dev
```

Open <http://localhost:5173>. The API runs at <http://localhost:3000>.

For a production-shaped local run:

```bash
docker compose up --build
```

## Important source and privacy notes

The FSP Community Calendar currently says that adding events requires an account and submit access. Porcupine Directory should only ingest or display calendar data after the project has permission for the chosen feed, and should retain source attribution and a last-synced timestamp.

When an approved iCal feed is available, set `FSP_ICAL_URL` and `ADMIN_API_KEY`, then run `POST /api/sync/fsp` with the key in the `x-admin-api-key` header. The public app never exposes the sync operation.

The Google document supplied for the project could not be read through the connected document tools during scaffolding, so the schema is deliberately flexible and the initial data import is not fabricated. Once an export or accessible copy is provided, an importer can map its rows into `listings` with a source label and review status.

See [`docs/northstar-spec.md`](docs/northstar-spec.md) for the product Northstar, MVP boundaries, privacy rules, and the next brainstorming questions.

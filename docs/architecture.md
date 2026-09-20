# Application architecture

Accounts use PostgreSQL-backed sessions, Argon2id password/recovery verifiers, SimpleWebAuthn passkeys, and server-side ownership/role authorization. Dedicated routes include `/login`, `/register`, `/recover`, `/account`, `/account/security`, `/account/entries`, `/editor`, `/admin`, `/listings/:id/edit`, and `/listings/:id/history`. Private query keys include account IDs, auth transitions clear private caches, and no auth tokens are persisted in browser storage. See [accounts and trust](accounts-and-trust.md) for the complete policy and operations guide.

## Navigation and sharing

The target discovery path is Home → section or search → entry, typically two or three navigation actions. The section navigation and global search remain available throughout the app. Mobile navigation uses a Material UI Drawer.

| Route                                       | Purpose                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| /                                           | Compact starting page with section shortcuts                               |
| /directory                                  | Search all directory entries                                               |
| /groups, /channels, /businesses, /resources | Dedicated sections using one reusable directory page                       |
| /listings/:id                               | Stable listing detail page, participation instructions, source and sharing |
| /events                                     | Searchable event list with date filters                                    |
| /events/calendar                            | Shareable month calendar with search                                       |
| /events/add                                 | How to publish an event through FSP                                        |
| /events/:id                                 | Stable event occurrence detail page                                        |
| /saved                                      | Browser-local bookmarks                                                    |
| /submit                                     | Validated contribution form                                                |
| /about                                      | Sources, freshness, and privacy information                                |

Directory parameters: `q`, `kind` (all-directory route), `access`, `tag`, `location`, `sort`, `page`, `pageSize`. Events use `q`, `from`, `to`, `page`, and `pageSize`. Dates are interpreted in America/New_York. A filter change resets the page. Invalid parameters show an actionable error; the API returns 400.

Detail routes use database UUIDs, independent of display names. Renaming an entry does not break its link. FSP upserts retain event IDs, and hidden or past events remain readable with explicit notices. Public listing lookup excludes pending and archived entries. Unknown routes and unknown IDs have deliberate not-found states. The production server serves the app shell for direct route loads and returns JSON errors for unknown API endpoints.

Copy link uses the full current URL; a Material UI Dialog offers manual copying if the clipboard is unavailable. Normal links support open-in-new-tab and browser history. Share URLs do not depend on router state or local storage. Bookmarks themselves remain personal: sharing /saved does not expose another person's collection. A public host is required for recipients on other machines; localhost is only the development address. Signal-specific rich link previews are future work.

## Libraries and responsibilities

- **Material UI + Emotion:** theme, responsive navigation, cards, forms, autocomplete, selects, pagination, dialogs, notifications, loading/error states. No custom modal/focus-trap or pagination widget.
- **FullCalendar:** lazy-loaded month view with the Luxon timezone plugin; pinned to a compatible v6 package family. MUI controls handle month/search navigation. Hourly imports run server-side; see [calendar integration](calendar-integration.md).
- **React Router:** nested application layout, lazy page modules, stable routes, URL parameters, history and scroll restoration.
- **TanStack Query:** typed query functions, query keys that include filters/pages, caching, request cancellation, retry and error states. Components do not manually fetch data in effects.
- **React Hook Form + Zod:** form state, field validation and typed submission. The server independently validates all inputs.
- **Shared Zod contracts:** runtime response validation and inferred TypeScript types. This prevents duplicated client/server DTO definitions from drifting.
- **PostgreSQL:** full-text/name search, filters, deterministic sorting, bounded pagination, and published-only visibility. Material UI provides controls; the API enforces query semantics and limits.

Cards remain the default public discovery view. `view=table` selects a compact Material UI Table using the same dataset and server-side filter/sort/pagination semantics. `connection=signal` (or another supported type) filters across listing kinds. A JSONB containment predicate keeps counts and pages distinct even with multiple matching links. View switches retain paging; filter changes reset to page 1. Default pages contain 12 records; the server accepts only 12, 24 or 48. Curated icon tags, proposal states and ownership assignment remain planned in the [directory improvement checklist](directory-improvements.md).

`shared/connections.ts` owns typed URL contracts and exact-host classification. Connections have stable UUIDs, type, URL, optional label and array order. Additive migrations backfill legacy destinations before enabling connection-change review invalidation. Legacy columns/source attribution remain for compatibility and old revisions. The importer reuses connection IDs, skips unchanged rows and respects whole-entry local overrides. Only HTTP(S) destinations without embedded credentials are actionable; unsupported legacy destinations remain in raw legacy fields/history. No private links are fetched for classification. Icons are bundled locally using [Simple Icons](https://github.com/simple-icons/simple-icons) brand paths inside MUI SvgIcon, plus Material icons for generic website/other/Nostr links. These marks identify destinations, not an affiliation or endorsement; review applicable brand guidelines before launch.

## Code boundaries

- `shared/contracts.ts`: domain types and request/response schemas.
- `server/routes/`: validated HTTP routes; parameterized database queries.
- `server/index.ts`: process startup, middleware, routes, error handling and SPA fallback.
- `src/pages/`: one component per routed page.
- `src/components/`: reusable layout, page states, sharing, cards, and pagination.
- `src/lib/`: API/query definitions and URL/date helpers.
- `src/state/`: browser-local saved-entry state.
- `src/theme.ts`: central Material UI theme.

Ownership is explicit: shareable view state belongs in the URL, remote records in TanStack Query, anonymous bookmarks in local storage, signed-in bookmarks in private server storage, and transient form/dialog state in their owning components. Accounts are optional; no tracking SDK or analytics dependency is introduced.

## Checks and conventions

Directory sections show a compact results count followed by an icon-only Filters disclosure. Search, type, access, topic, location, sort and reset live in the shared `FilterComponent`, mounted on demand inside Material UI Collapse. The panel starts closed, exposes `aria-expanded`/`aria-controls`, and displays an active-filter badge. Opening/closing is local UI state; applied filters remain URL-owned and continue filtering when collapsed. The toggle remains available for loading, empty, invalid-query and error states.

The shared `Page` component owns exactly one copy-link action, placed at the far right of the breadcrumb row on shareable pages. The credential-bearing activation page explicitly disables sharing and immediately removes its setup-token fragment. Do not repeat sharing controls in forms or detail content. Familiar actions use Material UI icons with explicit accessible names, hover/focus/touch tooltips, and 44px touch targets. Keep text for section destinations, content links, and date presets when an icon would be ambiguous. Icon navigation remains a real link and marks the current view with `aria-current`; toggle buttons use `aria-pressed`. Both retain keyboard access.

Use strict TypeScript, type-only imports, schema validation at network boundaries, React hook lint rules, stable keys, parameterized SQL and self-hosted assets. Use semantic links for navigation and buttons for actions. Keep pages focused and reuse library controls before introducing custom behavior.

`npm run lint`, `npm run format:check`, `npm run build`, `npm test`, and `npm run test:browser` are the review checks. Browser tests require the running preview. They cover direct links, refresh, history, query parameters, server paging, invalid URLs, clipboard fallback, saved data, form validation and mobile navigation.

Changes are scoped to this repository and its Compose project. No schema reset or source re-import is required for the route refactor.

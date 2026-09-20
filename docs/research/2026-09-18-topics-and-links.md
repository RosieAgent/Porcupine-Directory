# Topic icons and targeted directory corrections

Reviewed September 18, 2026 America/New_York (September 19 UTC). Applied via the host enrichment workflow, with database backup and per-entry revisions. The JSON files are one-time, version-guarded research records, not repeatable seeds.

## Sources and decisions

- [Independence Inn](https://nhindependenceinn.com/) and [contact page](https://nhindependenceinn.com/contact/): Business, with lodging/event-space summary and published reservations contact. The Jefferson stays a separate restaurant listing. No private personal contact was copied.
- [Liberty Ballot](https://libertyballot.com/) and [FAQ](https://libertyballot.com/faq/): Resource, with independent volunteer-run voting-guide context. No candidate recommendations or directory endorsement added. The crowdsourced Signal listing stays separate.
- [Young Americans for Liberty](https://www.yaliberty.org/): Organization, with national mission and listed NH chapter context. The original UNH Instagram remains an additional, explicitly chapter-specific imported link. No current Instagram activity or legal/tax status certified.
- Liberty Debate Planning, Monday Manumissions (the imported spelling), and NoChat:Freecoast Events: Channel per user clarification and redirect checks. Do not apply that category automatically to other groups or resources with Signal links.

## Shortlink review

Inspected HTTP redirect headers only for all 41 distinct TinyURL destinations found in 282 entries. No destination chats fetched, joined, indexed or monitored. 38 unique shortlinks redirected to `signal.group`, used in 41 entries. These connections are now explicitly typed Signal, so both icons and server-side platform filters work. Original URLs, connection IDs, listing IDs, tags and access/confirmation states are retained. Each correction includes a dated redirect-only reference. Enrichment also marks entries locally edited, protecting corrections from document reimport.

One FSP shortlink redirected to `www.facebook.com`: typed Facebook and placed under Additional resources, preserving all previous FSP research references. Two other shortlinks were **not** classified as Signal:

- **Free State outdoors, share, plan**, entry `ec956e07-a5fd-49ef-a596-e0aa3ebd6df8`, `https://tinyurl.com/23cytpev` → host `www.plat.co.jp`. This appears unrelated. No destination content fetched and no substitute invented. Existing entry/link left unchanged pending a verified replacement or editor decision to remove it. **Open follow-up: resolve or remove this misleading connection.**
- **LibertarianHomeland Communities**, entry `1aa7f4be-6699-4cde-a813-8c173019235b`, `https://tinyurl.com/mpru7epk` → host `docs.google.com`. Remains a website connection; no channel destination inferred and category unchanged pending review.

Some entries share the same shortened URL. No automatic merge was performed: a shared chat destination does not establish that the listings represent the same thing. Redirects can change later; a platform check is not an activity, identity, admission or accuracy attestation.

## Delivery / remaining work

- [x] Apply `2026-09-18-classifications.json` to the three named profiles with source dates and history.
- [x] Apply `2026-09-18-shortlinks.json`: 41 Signal connections and one Facebook connection; three requested Channel reclassifications.
- [x] Add bundled topic icons, full-name tooltips/accessibility, visible wrapping and shared filter links; names plus icons on details, form selections and filter options.
- [x] Hide unknown-access text only on Channel cards; keep status icons, known restrictions and detailed-page access information.
- [ ] Resolve the unrelated outdoors redirect and review the Google-document listing's category.
- [ ] PD-05: editor-managed stable tag definitions, permissions, audit and contributor-only selection. This delivery does not pretend that icon presentation completes catalog management.

Backup: ignored `data/backups/pre-topic-corrections-GmHrwY/database.dump` (private directory and mode 600 file). No entries/connections were deleted. No Rosie Studio changes.

Validation: production build, TypeScript, lint, formatting, unit checks and all 43 browser tests passed, including keyboard tooltips, touch long-press, shared filters, mobile layout and the corrected live entries. Isolated authentication/authorization/history/restore integration checks passed. Audit verification found 45 researched revisions, all protected from reimport, zero added confirmation badges and zero lost connection IDs/URLs. Desktop and mobile screenshots were visually reviewed; no browser page errors or horizontal overflow were observed.

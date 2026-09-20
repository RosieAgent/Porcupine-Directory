# Topic and platform tag cleanup

Owner-requested follow-up to the Telegram consolidation, September 19, 2026.

- Facebook, Telegram and Slack describe actual supplied URL hosts, not prose or an unchecked connection-type selection. Their catalog tags are added/removed on create, edit, content restore, import and enrichment. No network fetching, invitation following or automatic confirmation is involved. URL parsing rejects credential-bearing/non-web/lookalike hosts. Telegram web-client links count too. This enforcement currently covers these three platforms, not every other legacy platform label.
- Corrected You Are The Power's unsupported Slack label. Mama Maria's now has Facebook only; its source description mentioning Telegram remains historical text, not evidence of a supplied link.
- Retired the `20 Old Granite St` and `Manchester` tags and removed them from SoHo; its structured location and public address remain unchanged.
- Merged `Businesses/Services` into `Business` and `FB` into `Facebook`. The separate `Services` topic remains available; it was not a duplicate business classification targeted by this request.
- Renamed the compound food category to `Food/Drink`, retaining its ID and old-name filter compatibility. Added the separate `Farming` topic with a nature icon. Seven entries receive Food/Drink; five producer/grower/homesteading entries also receive Farming. Recipes and wine/spirits do not receive Farming merely because of the old compound category.
- The earlier combined Facebook/Telegram sentence tag remains retired/merged for historical references, not selectable or shown on cards. This cleanup corrects the earlier assumption that its prose alone justified a Telegram tag.

The [maintenance script](tag-taxonomy-cleanup.mjs) checks expected catalog versions and the reviewed food entry set, dry-runs with rollback by default, and requires `--apply` to commit. It updated 27 entries, auditing every catalog and entry change as host maintenance without impersonating an account. Assertions verified no change to connections, descriptions, ownership, locations, sources or publication status. No new confirmation is granted. Backup: `data/backups/pre-tag-taxonomy-ZyMmuL/database.dump` (private/ignored).

Catalog guideline: tags should be concise topics/descriptors, not addresses or imported sentences. Independent subjects should be separate tags; avoid mechanically splitting every slash because labels such as Food/Drink can intentionally describe one useful topic. Other legacy compound labels require semantic review rather than speculative mass reclassification. Existing content and historic revisions remain recoverable.

Validation passed: production build/typecheck, lint/formatting, 52 unit tests, isolated tag create/edit/restore and full authentication integration checks, plus all 70 browser tests after updating the preview. Live checks cover all 284 published entries and the requested catalog/card changes. Entry IDs, owners and connection checksums still match the pre-cleanup baseline. Final tag usage: Facebook 17, Telegram 8, Slack 0, Food/Drink 7, Farming 5.

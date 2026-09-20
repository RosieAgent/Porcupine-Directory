# Telegram tag cleanup

Applied September 19, 2026, following the owner's request to use one Telegram tag.

Follow-up: the [topic/platform cleanup](tag-taxonomy-cleanup.md) supersedes the eight-entry count below and removes Telegram where no Telegram URL was supplied. The original combined sentence was not sufficient evidence of a link.

- Merged Telegram @BarterTowne, Telegram @ManchPorcs and Telegram @ShireSociety into Telegram.
- Replaced the imported combined Facebook/Telegram sentence tag with Telegram and Facebook. Its original platform note remains in the entry description.
- Updated four entries; eight entries now use the canonical Telegram tag. No connection URLs, ownership, descriptions or source references changed.
- Retired definitions remain as internal merge records; old names and IDs resolve to Telegram. Contributors cannot recreate the old definitions through submission/import aliases.
- Entry changes and catalog merges are audited as host maintenance, without impersonating an account. Private pre-change backup: `data/backups/pre-telegram-Gl8qir/database.dump`.

[The maintenance transaction](telegram-tags.sql) was first dry-run with rollback, then committed. Its assertions reject reruns or changed catalog definitions. Live API checks verified one active Telegram tag, all eight entries, old name/ID filters and the preserved Facebook label. This is a data cleanup, not a schema migration or application release.

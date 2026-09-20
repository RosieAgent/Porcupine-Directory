# IRL, Learning, political topics, Website and Volunteer

Owner-requested follow-up, September 19, 2026:

- Merge `in person` and `InPerson` into `IRL`.
- Merge `Learning (Adult)` into `Learning`; deduplicate entries already carrying both.
- Rename `Political Activism` to `Activism`, keeping `Politics` on those entries.
- Rename `Political - Single Issue` to `Single Issue`, keeping `Politics` separately.
- Merge `Internet` and `Web` into `Website`, normalize lowercase `website`, and reconcile the tag against actual website connections. The server enforces this on future create/edit/restore/import/enrichment writes. Known social/chat destinations and reviewed short links typed as chats do not count as generic websites. No URLs are visited or rewritten.
- Rename `Free State Project Inc Teams` to `Volunteer`; preserve entry descriptions and organizational context. This label does not promise that an opportunity is currently open.
- Manchester remains retired, with no entry uses; structured locations remain intact. The staff catalog now hides retired definitions by default, with an explicit Show retired tags checkbox for maintenance. Historical records are not deleted.

The tentative **18+** idea is recorded for a later policy decision, not assigned automatically. Adult learning is not proof of age-restricted or mature content. Before using that label, distinguish adult-focused audiences from actual entry/participation age restrictions and define who can apply it and based on what evidence.

The [maintenance script](topic-label-cleanup.mjs) validates expected catalog versions, uses a transaction/catalog lock and checks each updated entry for unintended non-tag changes. It dry-ran with rollback before applying 77 entry updates. Old names/IDs remain filter aliases; audit records identify host maintenance without impersonating an account. Entry IDs, owners, connections, locations, sources and publication status remain unchanged. Normal content-edit confirmation invalidation applies; no trust is granted. Private backup: `data/backups/pre-topic-labels-SV2ftL/database.dump`.

Verification passed: production build/typecheck, lint/formatting, 53 unit tests, isolated tag create/edit/restore and authentication integration suites, and all 72 browser tests against the rebuilt preview. Live checks confirmed old tag names still filter correctly, Manchester is hidden by default in staff tools, and Website labels match connections across all 284 entries. Entry-ID, owner and connection checksums match the pre-cleanup baseline. Final uses: IRL 40, Learning 33, Activism 23, Single Issue 18, Volunteer 8, Website 39.

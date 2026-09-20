# You Are The Power, Rooted Free and community tag cleanup

User-requested research, September 19, 2026. The adjacent JSON uses exact entry IDs, names and revisions; application is audited as host source enrichment, not an impersonated editor confirmation.

## You Are The Power

The [official About page](https://www.youarethepower.net/about/) describes the organization as a 501(c)(3) nonprofit. Add the existing Nonprofit tag, attribute the statement to the organization and avoid tax-deductibility advice or independent legal certification. Describe its four [programs](https://www.youarethepower.net/our-programs/), national remit and [volunteer](https://www.youarethepower.net/volunteer/) options. [Membership](https://www.youarethepower.net/membership/) includes free and paid choices; do not hard-code prices. No NH chapter, guaranteed case acceptance, success rate or new Slack connection is claimed. The single homepage remains the primary connection; research subpages belong in sources. Replace local/state teams with Nonprofit and Volunteer while retaining existing Politics/Activism/IRL/Website.

## Rooted Free

The [homepage](https://www.rootedfree.com/) describes a farm-based community, gatherings, workshops and retreats. [Services](https://www.rootedfree.com/services) include traveling canning workshops and venue/event hosting. Describe these offerings without repeating medical or therapeutic claims. [Membership](https://www.rootedfree.com/membership) explicitly says it is private, voluntary, free and required; preserve that access requirement in prose rather than a Membership tag. Free membership does not establish free events/services.

The [contact page](https://www.rootedfree.com/contact) establishes Henniker, NH and links to Facebook, Instagram and Telegram. Direct public HTML was checked for actual destinations, not just social icons; the Telegram invite path is retained while using HTTPS instead of the source's HTTP. Add the homepage and these actual connections; remove the unsupported Signal descriptor. Use existing Learning, Self-Improvement/Health, IRL, Skills, Arts and Community Groups topics; Website/Facebook/Telegram reflect supplied links. No nonprofit status or legal business structure is inferred. Do not copy the street address, personal biographies or email; visitors can use the official site.

## Catalog maintenance

[Version-guarded maintenance script](../maintenance/community-topic-cleanup.mjs), dry-run by default:

- Merge Accelerating Migration → Migration across five entries, deduplicating entries that already have Migration.
- Merge IRL - Quill → IRL on Arts & Crafts Club.
- Retire Membership and local and state teams, removing public usage without destroying historical definitions.
- Preserve merged-name/ID filter aliases, stable entry IDs, ownership, connections and non-tag fields. Record catalog and entry revisions; normal confirmation invalidation applies, and no new trust is granted.

Enrichment removes the two retired labels from the researched entries first. The subsequent catalog pass changes six other entries only. The scripts are one-time, reviewed operations, not recurring imports; stale versions abort rather than overwrite later edits.

Applied after private backup `data/backups/pre-community-topics-I06bZy/database.dump`: You Are The Power revision 5 → 6, Rooted Free 3 → 4, six tag-only entry revisions and six catalog revisions. Verified all 284 entry IDs/owners, preserved the existing YATP connection ID, and checked that all 276 out-of-scope entries retained their content/version digest. Confirmation is not granted. The JSON and maintenance script are now applied records; do not rerun them against later revisions.

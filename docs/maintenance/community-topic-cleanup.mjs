// Explicit requested catalog cleanup. Dry-run/rollback by default; --apply commits.
import assert from "node:assert/strict";
import pg from "pg";
const connectionString =
  process.env.MAINTENANCE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("Set MAINTENANCE_DATABASE_URL or DATABASE_URL.");
const pool = new pg.Pool({
  connectionString,
});
const client = await pool.connect();
const apply = process.argv.includes("--apply");
const merges = [
  ["Accelerating Migration", "Migration"],
  ["IRL - Quill", "IRL"],
];
const retire = ["local and state teams", "Membership"];
const versions = new Map([
  ["Accelerating Migration", 1],
  ["Migration", 1],
  ["IRL - Quill", 1],
  ["IRL", 3],
  ["local and state teams", 1],
  ["Membership", 1],
]);
const expectedEntries = new Set([
  "bf799c15-6975-4e33-aeb1-7defea10fe86",
  "b48622cf-5542-4fd2-9051-55ba418742aa",
  "2f935093-8255-4eb0-bd1f-f184d20ea024",
  "eb42ecc6-f71b-40e6-8ace-8b2aa6cc5627",
  "969f2bc3-9000-4e7d-bf69-344853543e27",
  "3bde5fed-90de-4f0c-9f48-fe17d86c51af",
  "1a87eb72-91b1-47b9-aac3-dd20eed35680",
  "05587d94-51bd-4531-8a8b-d71d387a9497",
]);
const reason =
  "User-requested catalog cleanup: merge Accelerating Migration into Migration and IRL - Quill into IRL; retire local and state teams and Membership. Participation requirements stay in joining instructions.";
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock(4350010)");
  const tags = (
    await client.query("SELECT * FROM tag_definitions ORDER BY id FOR UPDATE")
  ).rows;
  const byName = new Map(tags.map((tag) => [tag.name, tag]));
  const snapshot = async (id) =>
    (
      await client.query(
        "SELECT to_jsonb(d)||jsonb_build_object('aliases',(SELECT jsonb_agg(name ORDER BY name) FROM tag_names WHERE tag_id=d.id)) AS data FROM tag_definitions d WHERE id=$1",
        [id],
      )
    ).rows[0].data;
  const before = new Map();
  for (const [name, version] of versions) {
    const tag = byName.get(name);
    assert.ok(
      tag && tag.version === version && !tag.retired && !tag.merged_into,
      `Catalog changed: ${name}. Review again.`,
    );
    before.set(tag.id, await snapshot(tag.id));
  }
  for (const [from, to] of merges) {
    const source = byName.get(from).id,
      target = byName.get(to).id;
    await client.query("UPDATE tag_names SET tag_id=$2 WHERE tag_id=$1", [
      source,
      target,
    ]);
    await client.query(
      "UPDATE tag_definitions SET retired=true,merged_into=$2,version=version+1 WHERE id=$1",
      [source, target],
    );
    await client.query(
      "UPDATE tag_definitions SET version=version+1 WHERE id=$1",
      [target],
    );
  }
  for (const name of retire)
    await client.query(
      "UPDATE tag_definitions SET retired=true,version=version+1 WHERE id=$1",
      [byName.get(name).id],
    );
  await client.query(
    "SELECT set_config('app.actor','',true),set_config('app.action','tags-merged',true),set_config('app.reason',$1,true)",
    [reason],
  );
  const oldNames = [...merges.map(([from]) => from), ...retire];
  const entries = (
    await client.query(
      "SELECT * FROM listings WHERE tags && $1::text[] ORDER BY id FOR UPDATE",
      [oldNames],
    )
  ).rows;
  const replacements = new Map(merges);
  const updates = [];
  const nonTags = (row) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          ![
            "tags",
            "version",
            "updated_at",
            "locally_edited",
            "search_vector",
            "self_confirmed_at",
            "editor_reviewed_at",
            "last_confirmed_at",
          ].includes(key),
      ),
    );
  for (const entry of entries) {
    assert.ok(
      expectedEntries.has(entry.id),
      `Unexpected affected entry ${entry.name}; review again.`,
    );
    const next = [
      ...new Set(
        entry.tags
          .filter((tag) => !retire.includes(tag))
          .map((tag) => replacements.get(tag) ?? tag),
      ),
    ];
    const after = (
      await client.query(
        "UPDATE listings SET tags=$2,locally_edited=true WHERE id=$1 AND version=$3 RETURNING *",
        [entry.id, next, entry.version],
      )
    ).rows[0];
    assert.ok(after, "Stale entry");
    assert.deepEqual(
      nonTags(after),
      nonTags(entry),
      "Unexpected non-tag change",
    );
    updates.push({ name: entry.name, before: entry.tags, after: next });
  }
  for (const [id, data] of before)
    await client.query(
      "INSERT INTO tag_revisions(tag_id,actor_id,action,reason,before_data,after_data) VALUES ($1,NULL,'community-topic-cleanup',$2,$3,$4)",
      [id, reason, JSON.stringify(data), JSON.stringify(await snapshot(id))],
    );
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM listings WHERE tags && $1::text[]",
        [oldNames],
      )
    ).rows[0].n,
    0,
  );
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(
    JSON.stringify(
      {
        mode: apply ? "applied" : "dry-run rolled back",
        count: updates.length,
        entries: updates,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

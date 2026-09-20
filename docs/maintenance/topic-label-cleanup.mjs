// Owner-requested local maintenance. Dry-run/rollback unless --apply is supplied.
import assert from "node:assert/strict";
import pg from "pg";
import { syncPlatformTags } from "../../dist-server/server/tags.js";
const pool = new pg.Pool({
  connectionString:
    "postgres://porcupine:porcupine@127.0.0.1:5438/porcupine_directory",
});
const client = await pool.connect();
const apply = process.argv.includes("--apply");
const merges = [
  ["in person", "IRL"],
  ["InPerson", "IRL"],
  ["Learning (Adult)", "Learning"],
  ["Internet", "Website"],
  ["Web", "Website"],
];
const renames = [
  ["Political Activism", "Activism", "ballot"],
  ["Political - Single Issue", "Single Issue", "ballot"],
  ["Free State Project Inc Teams", "Volunteer", "meeting"],
];
const reason =
  "Owner-requested topic cleanup: consolidate IRL, Learning and link-derived Website; separate Politics/Activism/Single Issue; rename FSP team opportunities to Volunteer. No inferred age restriction.";
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock(4350010)");
  const all = (
    await client.query("SELECT * FROM tag_definitions ORDER BY id FOR UPDATE")
  ).rows;
  const byName = new Map(all.map((t) => [t.name, t]));
  const changedNames = new Set([
    ...merges.flat(),
    ...renames.map(([name]) => name),
  ]);
  for (const name of changedNames) {
    const tag = byName.get(name);
    assert.ok(
      tag && tag.version === 1 && !tag.retired && !tag.merged_into,
      `Catalog changed: ${name}`,
    );
  }
  for (const [, name] of renames)
    assert.ok(!byName.has(name), `Target already exists: ${name}`);
  assert.ok(
    byName.get("Manchester")?.retired,
    "Manchester must remain retired",
  );
  const snapshot = async (id) =>
    (
      await client.query(
        "SELECT to_jsonb(d)||jsonb_build_object('aliases',(SELECT jsonb_agg(name ORDER BY name) FROM tag_names WHERE tag_id=d.id)) AS data FROM tag_definitions d WHERE id=$1",
        [id],
      )
    ).rows[0].data;
  const before = new Map();
  for (const name of changedNames)
    before.set(byName.get(name).id, await snapshot(byName.get(name).id));
  for (const [from, to] of merges) {
    const source = byName.get(from).id,
      target = byName.get(to).id;
    await client.query("UPDATE tag_names SET tag_id=$2 WHERE tag_id=$1", [
      source,
      target,
    ]);
    await client.query(
      "UPDATE tag_definitions SET retired=true,merged_into=$2,version=version+1 WHERE id=$1 OR merged_into=$1",
      [source, target],
    );
    await client.query(
      "UPDATE tag_definitions SET version=version+1 WHERE id=$1",
      [target],
    );
  }
  for (const [from, to, icon] of renames) {
    const id = byName.get(from).id;
    await client.query(
      "UPDATE tag_definitions SET name=$2,icon=$3,version=version+1 WHERE id=$1",
      [id, to, icon],
    );
    await client.query(
      "INSERT INTO tag_names(key,name,tag_id) VALUES ($1,$2,$3)",
      [to.toLowerCase(), to, id],
    );
  }
  await client.query(
    "SELECT set_config('app.actor','',true),set_config('app.action','tags-merged',true),set_config('app.reason',$1,true)",
    [reason],
  );
  const replacement = new Map(
    [...merges, ...renames].map(([a, b]) => [a.toLowerCase(), b]),
  );
  replacement.set("website", "Website");
  const entries = (
    await client.query("SELECT * FROM listings ORDER BY id FOR UPDATE")
  ).rows;
  const updates = [];
  for (const entry of entries) {
    let tags = entry.tags
      .filter((t) => t.toLowerCase() !== "manchester")
      .map((t) => replacement.get(t.toLowerCase()) ?? t);
    if (
      entry.tags.some((t) =>
        ["Political Activism", "Political - Single Issue"].includes(t),
      )
    )
      tags.push("Politics");
    tags = await syncPlatformTags(
      client,
      [...new Set(tags)],
      entry.connections,
    );
    if (JSON.stringify(tags) === JSON.stringify(entry.tags)) continue;
    const after = (
      await client.query(
        "UPDATE listings SET tags=$2,locally_edited=true WHERE id=$1 AND version=$3 RETURNING *",
        [entry.id, tags, entry.version],
      )
    ).rows[0];
    assert.ok(after, "Stale entry");
    const content = (row) =>
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
    assert.deepEqual(content(after), content(entry), "Non-tag fields changed");
    updates.push({ name: entry.name, before: entry.tags, after: tags });
  }
  for (const [id, data] of before)
    await client.query(
      "INSERT INTO tag_revisions(tag_id,actor_id,action,reason,before_data,after_data) VALUES ($1,NULL,'topic-label-cleanup',$2,$3,$4)",
      [id, reason, JSON.stringify(data), JSON.stringify(await snapshot(id))],
    );
  const oldNames = [
    ...merges.map(([name]) => name),
    ...renames.map(([name]) => name),
    "Manchester",
    "website",
  ];
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

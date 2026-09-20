// Explicit owner-requested maintenance. Dry-run by default; --apply commits.
// Uses the local Porcupine database, never a user's login or impersonated actor.
import assert from "node:assert/strict";
import pg from "pg";
import { syncPlatformTags } from "../../dist-server/server/tags.js";
const apply = process.argv.includes("--apply");
const pool = new pg.Pool({
  connectionString:
    "postgres://porcupine:porcupine@127.0.0.1:5438/porcupine_directory",
});
const client = await pool.connect();
const reason =
  "Owner-requested tag cleanup: actual-link Facebook/Telegram/Slack labels; Business and Facebook aliases; remove location tags; separate Food/Drink and Farming.";
const foodOld = "Food, Farming, & Drink Discussion";
const farmingIds = new Set([
  "398fd8b9-1e0c-42a3-aa06-5990a88af7be", // Food producers/network
  "cd0fc285-a50f-4263-a5ef-f4b7d92dabed", // Mushroom growers
  "d08d004d-c50c-40a6-ba51-cbe3b4a36cf3", // Local meats/produce
  "b2d92cfe-64ed-4e78-bda2-cf159f59c038", // Homesteading/foraging
  "3c1b7fac-a4ca-4e38-b878-7dfb38b29734", // Homesteading deals
]);
const foodIds = new Set([
  ...farmingIds,
  "f90658f5-5960-4730-b457-cdfa5a9057eb",
  "7ab84f6e-5e1a-4c36-88e9-0c606c74f1cb",
]);
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock(4350010)");
  const tags = (
    await client.query("SELECT * FROM tag_definitions ORDER BY id FOR UPDATE")
  ).rows;
  const byName = new Map(tags.map((t) => [t.name, t]));
  for (const [name, version] of [
    ["Business", 1],
    ["Businesses/Services", 1],
    ["Facebook", 1],
    ["FB", 1],
    ["Telegram", 2],
    ["Slack", 1],
    ["20 Old Granite St", 1],
    ["Manchester", 1],
    [foodOld, 1],
  ]) {
    const tag = byName.get(name);
    assert.ok(
      tag && !tag.retired && !tag.merged_into && tag.version === version,
      `Catalog changed: ${name}; review again.`,
    );
  }
  assert.ok(
    !byName.has("Farming") && !byName.has("Food/Drink"),
    "Target topics already exist; review again.",
  );
  const snapshot = async (id) =>
    (
      await client.query(
        "SELECT to_jsonb(d)||jsonb_build_object('aliases',(SELECT jsonb_agg(name ORDER BY name) FROM tag_names WHERE tag_id=d.id)) AS data FROM tag_definitions d WHERE id=$1",
        [id],
      )
    ).rows[0].data;
  const changes = [];
  for (const name of [
    "Business",
    "Businesses/Services",
    "Facebook",
    "FB",
    "20 Old Granite St",
    "Manchester",
    foodOld,
  ]) {
    const tag = byName.get(name);
    changes.push({
      id: tag.id,
      before: await snapshot(tag.id),
      action: "taxonomy-cleanup",
    });
  }
  async function merge(sourceName, targetName) {
    const source = byName.get(sourceName),
      target = byName.get(targetName);
    await client.query("UPDATE tag_names SET tag_id=$2 WHERE tag_id=$1", [
      source.id,
      target.id,
    ]);
    await client.query(
      "UPDATE tag_definitions SET retired=true,merged_into=$2,version=version+1 WHERE id=$1 OR merged_into=$1",
      [source.id, target.id],
    );
    await client.query(
      "UPDATE tag_definitions SET version=version+1 WHERE id=$1",
      [target.id],
    );
  }
  await merge("Businesses/Services", "Business");
  await merge("FB", "Facebook");
  for (const name of ["20 Old Granite St", "Manchester"])
    await client.query(
      "UPDATE tag_definitions SET retired=true,version=version+1 WHERE id=$1",
      [byName.get(name).id],
    );
  const food = byName.get(foodOld);
  await client.query(
    "UPDATE tag_definitions SET name='Food/Drink',icon='food',version=version+1 WHERE id=$1",
    [food.id],
  );
  await client.query(
    "INSERT INTO tag_names(key,name,tag_id) VALUES ('food/drink','Food/Drink',$1)",
    [food.id],
  );
  const farming = (
    await client.query(
      "INSERT INTO tag_definitions(name,icon) VALUES ('Farming','nature') RETURNING id",
    )
  ).rows[0];
  await client.query(
    "INSERT INTO tag_names(key,name,tag_id) VALUES ('farming','Farming',$1)",
    [farming.id],
  );
  changes.push({ id: farming.id, before: null, action: "create" });
  await client.query(
    "SELECT set_config('app.actor','',true),set_config('app.action','tags-merged',true),set_config('app.reason',$1,true)",
    [reason],
  );
  const entries = (
    await client.query("SELECT * FROM listings ORDER BY id FOR UPDATE")
  ).rows;
  assert.deepEqual(
    new Set(entries.filter((e) => e.tags.includes(foodOld)).map((e) => e.id)),
    foodIds,
    "Food category changed; review again.",
  );
  const updated = [];
  for (const entry of entries) {
    let next = entry.tags
      .filter((t) => !["20 Old Granite St", "Manchester"].includes(t))
      .map((t) =>
        t === "Businesses/Services"
          ? "Business"
          : t === "FB"
            ? "Facebook"
            : t === foodOld
              ? "Food/Drink"
              : t,
      );
    if (farmingIds.has(entry.id)) next.push("Farming");
    next = await syncPlatformTags(
      client,
      [...new Set(next)],
      entry.connections,
    );
    if (JSON.stringify(next) === JSON.stringify(entry.tags)) continue;
    const after = (
      await client.query(
        "UPDATE listings SET tags=$2,locally_edited=true WHERE id=$1 AND version=$3 RETURNING *",
        [entry.id, next, entry.version],
      )
    ).rows[0];
    assert.ok(after, "Entry version changed");
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
    assert.deepEqual(
      content(after),
      content(entry),
      "Unexpected change outside tags",
    );
    updated.push({ name: entry.name, before: entry.tags, after: next });
  }
  for (const change of changes)
    await client.query(
      "INSERT INTO tag_revisions(tag_id,actor_id,action,reason,before_data,after_data) VALUES ($1,NULL,$2,$3,$4,$5)",
      [
        change.id,
        change.action,
        reason,
        JSON.stringify(change.before),
        JSON.stringify(await snapshot(change.id)),
      ],
    );
  const invalid = (
    await client.query(
      "SELECT count(*)::int AS n FROM listings WHERE tags && $1::text[]",
      [
        [
          "FB",
          "Businesses/Services",
          "20 Old Granite St",
          "Manchester",
          foodOld,
          "Both on facebook and Telegram more updates on Facebook",
        ],
      ],
    )
  ).rows[0].n;
  assert.equal(invalid, 0);
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(
    JSON.stringify(
      {
        mode: apply ? "applied" : "dry-run rolled back",
        count: updated.length,
        entries: updated,
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

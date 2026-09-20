import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
const url =
  process.env.TEST_DATABASE_URL ??
  "postgres://porcupine:porcupine@127.0.0.1:5438/porcupine_directory";
const schema = "tags_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: url });
const scoped = new URL(url);
scoped.searchParams.set("options", "-c search_path=" + schema);
Object.assign(process.env, {
  DATABASE_URL: scoped.toString(),
  DATABASE_SCHEMA: schema,
  START_SERVER: "false",
  FSP_SYNC_ENABLED: "false",
  PUBLICATION_SYNC_ENABLED: "false",
  PASSKEYS_ENABLED: "false",
  STAFF_AUTH_MODE: "password_recent",
  APP_ORIGIN: "http://localhost:4351",
  SESSION_SECRET: randomUUID() + randomUUID(),
});
let pool, server, store;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  ({ pool } = await import("../dist-server/server/db.js"));
  await pool.query(await readFile("db/init/001_schema.sql", "utf8"));
  // Existing legacy variants must survive migration and resolve case-insensitively.
  const legacy = (
    await pool.query(
      "INSERT INTO listings(kind,name,summary,tags,status) VALUES ('business','Legacy business','Legacy imported business.',ARRAY['Technology','technology'],'published') RETURNING id",
    )
  ).rows[0];
  const { app } = await import("../dist-server/server/index.js");
  // Reproduce the old 010 trigger interaction, including a later human edit.
  const migrationClient = await pool.connect();
  try {
    await migrationClient.query("BEGIN");
    const contextMigration = await readFile(
      "db/migrations/007_entry_context.sql",
      "utf8",
    );
    await migrationClient.query(
      contextMigration.slice(
        contextMigration.indexOf(
          "CREATE OR REPLACE FUNCTION listing_version()",
        ),
      ),
    );
    const reference = [
      {
        url: "https://example.org/source",
        label: "Dated source",
        checkedAt: "2026-09-01T12:00:00.000Z",
      },
    ];
    const fixtures = (
      await migrationClient.query(
        "INSERT INTO listings(kind,name,summary,reference_sources,self_confirmed_at) SELECT 'business','Source fixture '||n,'Original facts',$1::jsonb,now() FROM generate_series(1,2) n RETURNING id",
        [JSON.stringify(reference)],
      )
    ).rows;
    await migrationClient.query(
      "SELECT set_config('app.action','tag-catalog-migration',true)",
    );
    await migrationClient.query(
      "UPDATE listings SET tags=ARRAY['Business'] WHERE id=ANY($1::uuid[])",
      [fixtures.map((f) => f.id)],
    );
    await migrationClient.query("SELECT set_config('app.action','edit',true)");
    await migrationClient.query(
      "UPDATE listings SET summary='Later human correction' WHERE id=$1",
      [fixtures[1].id],
    );
    await migrationClient.query(
      await readFile("db/migrations/015_catalog_provenance.sql", "utf8"),
    );
    const repaired = (
      await migrationClient.query(
        "SELECT reference_sources,self_confirmed_at FROM listings WHERE id=$1",
        [fixtures[0].id],
      )
    ).rows[0];
    assert.deepEqual(repaired.reference_sources, reference);
    assert.equal(repaired.self_confirmed_at, null);
    const later = (
      await migrationClient.query(
        "SELECT reference_sources,summary FROM listings WHERE id=$1",
        [fixtures[1].id],
      )
    ).rows[0];
    assert.deepEqual(later.reference_sources, []);
    assert.equal(later.summary, "Later human correction");
    await migrationClient.query("COMMIT");
  } catch (error) {
    await migrationClient.query("ROLLBACK");
    throw error;
  } finally {
    migrationClient.release();
  }
  ({ sessionStore: store } = await import("../dist-server/server/security.js"));
  const { inviteAccount } =
    await import("../dist-server/server/setup-account.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  function browser() {
    let cookie = "";
    return async (path, method = "GET", body, expected = 200) => {
      const headers = { cookie, "Content-Type": "application/json" };
      if (method !== "GET") {
        const r = await fetch(base + "/auth/csrf", { headers: { cookie } });
        cookie = r.headers.get("set-cookie")?.split(";")[0] || cookie;
        headers.cookie = cookie;
        headers["X-CSRF-Token"] = (await r.json()).token;
      }
      const r = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      cookie = r.headers.get("set-cookie")?.split(";")[0] || cookie;
      const data = await r.json();
      assert.equal(
        r.status,
        expected,
        `${method} ${path}: ${JSON.stringify(data)}`,
      );
      return data;
    };
  }
  const staff = browser(),
    anon = browser(),
    user = browser();
  const password = "fixture-tag-catalog-password!";
  await staff("/auth/activate", "POST", {
    token: await inviteAccount("tags.admin", "administrator"),
    password,
  });
  await staff("/auth/recovery/saved", "POST");
  await staff("/auth/reauthenticate", "POST", { password });
  await user("/auth/signup", "POST", { username: "tag.owner", password }, 201);
  const edit = {
    name: "Automation",
    icon: "tech",
    aliases: ["AI workflows"],
    reason: "Catalog test creation",
  };
  await anon("/tags", "POST", edit, 403);
  await user("/tags", "POST", edit, 403);
  await staff(
    "/tags",
    "POST",
    { ...edit, icon: "https://tracking.example/pixel" },
    400,
  );
  const automation = await staff("/tags", "POST", edit, 201);
  await staff(
    "/tags",
    "POST",
    { ...edit, name: "Other", aliases: ["ai WORKFLOWS"] },
    409,
  );
  const another = await staff(
    "/tags",
    "POST",
    { ...edit, name: "Web design", aliases: [], icon: "web" },
    201,
  );
  const input = {
    name: "Owned automation",
    summary: "Useful process automation fixture.",
    tags: ["AI WORKFLOWS", "Business"],
    connections: [],
  };
  await user(
    "/listings",
    "POST",
    { ...input, tags: ["Unapproved private tag"] },
    400,
  );
  const created = await user("/listings", "POST", input, 201);
  const entry = await anon(`/listings/${created.id}`);
  assert.deepEqual(entry.tags, ["Automation", "Business"]);
  assert.equal(entry.kind, "entry");
  assert.ok(
    (await anon("/listings?kind=business")).items.some(
      (item) => item.id === created.id,
    ),
  );
  const catalog = await anon("/tags");
  const business = catalog.items.find((t) => t.name === "Business");
  assert.ok(business.id);
  const found = await anon(`/listings?tags=${automation.id},${business.id}`);
  assert.equal(found.total, 1);
  assert.equal(found.items[0].id, created.id);
  assert.equal(
    (await anon(`/listings?tags=${another.id},${business.id}`)).total,
    0,
  );
  await anon("/listings?tags=forged", "GET", undefined, 400);
  assert.equal((await anon("/listings?tag=TECHNOLOGY")).items[0].id, legacy.id);
  const sources = [
    {
      url: "https://example.org/",
      label: "Original dated research",
      checkedAt: "2026-09-01T12:00:00.000Z",
    },
  ];
  await pool.query(
    "UPDATE listings SET reference_sources=$2,self_confirmed_at=now(),editor_reviewed_at=now() WHERE id=$1",
    [created.id, JSON.stringify(sources)],
  );
  await staff(`/tags/${automation.id}`, "PUT", {
    ...edit,
    name: "AI Automation",
    version: 1,
  });
  await staff(`/tags/${automation.id}`, "PUT", { ...edit, version: 1 }, 409);
  assert.equal(
    (await anon("/listings?tag=Automation")).items[0].id,
    created.id,
  );
  const changed = await anon(`/listings/${created.id}`);
  assert.ok(changed.tags.includes("AI Automation"));
  assert.deepEqual(changed.referenceSources, sources);
  assert.equal(changed.selfConfirmedAt, null);
  assert.equal(changed.editorReviewedAt, null);
  await staff(`/tags/${automation.id}`, "PUT", {
    ...edit,
    name: "AI Automation",
    version: 2,
    retired: true,
  });
  await anon("/listings", "POST", { ...input, tags: ["Automation"] }, 400);
  await user(`/listings/${created.id}`, "PUT", {
    entry: { ...changed, location: "", url: "", contactUrl: "" },
    version: changed.version,
    reason: "Retain existing retired tag",
  });
  await staff(`/tags/${automation.id}/merge`, "POST", {
    targetId: another.id,
    version: 3,
    targetVersion: 1,
    reason: "Merge duplicate service tags",
  });
  assert.equal(
    (await anon(`/listings?tags=${automation.id}`)).items[0].id,
    created.id,
  );
  assert.equal(
    (await anon("/listings?tag=AI%20workflows")).items[0].id,
    created.id,
  );
  const merged = await anon(`/listings/${created.id}`);
  assert.ok(merged.tags.includes("Web design"));
  await staff(`/listings/${created.id}/restore`, "POST", {
    version: merged.version,
    targetVersion: 1,
    reason: "Restore old entry after catalog merge",
  });
  const restored = await anon(`/listings/${created.id}`);
  assert.ok(restored.tags.includes("Web design"));
  assert.equal(restored.selfConfirmedAt, null);
  const privateOwner = await pool.query(
    "SELECT owner_id FROM listings WHERE id=$1",
    [created.id],
  );
  assert.ok(privateOwner.rows[0].owner_id);
  assert.equal("owner_id" in restored, false);
  const history = await staff(`/tags/${automation.id}/history`);
  assert.ok(history.items.length >= 4);
  await user(`/tags/${automation.id}/history`, "GET", undefined, 403);
  // Real API writes must not let selected tags or forged connection types
  // override the actual URL host; restores use the restored links too.
  for (const name of ["Facebook", "Telegram", "Slack", "Website"]) {
    await staff(
      "/tags",
      "POST",
      { name, icon: "chat", reason: "Fixture platform catalog" },
      201,
    );
  }
  const linked = await user(
    "/listings",
    "POST",
    {
      name: "Platform fixture",
      summary: "Test link-derived platform tags.",
      tags: ["Slack", "Telegram"],
      connections: [
        {
          id: randomUUID(),
          type: "telegram",
          url: "https://facebook.com/fixture",
          label: "Declared type is not evidence",
        },
      ],
    },
    201,
  );
  const initialLinked = await anon(`/listings/${linked.id}`);
  assert.deepEqual(initialLinked.tags, ["Facebook"]);
  const webEntry = await user(
    "/listings",
    "POST",
    {
      name: "Website fixture",
      summary: "A supplied website earns the Website tag.",
      tags: ["Slack"],
      connections: [
        { id: randomUUID(), type: "website", url: "https://example.org/" },
      ],
    },
    201,
  );
  const webSaved = await anon(`/listings/${webEntry.id}`);
  assert.deepEqual(webSaved.tags, ["Website"]);
  await user(`/listings/${webEntry.id}`, "PUT", {
    version: webSaved.version,
    reason: "Remove the website connection",
    entry: {
      ...webSaved,
      location: "",
      url: "",
      contactUrl: "",
      connections: [],
    },
  });
  assert.deepEqual((await anon(`/listings/${webEntry.id}`)).tags, []);
  await user(`/listings/${linked.id}`, "PUT", {
    version: initialLinked.version,
    reason: "Replace platform link",
    entry: {
      ...initialLinked,
      location: "",
      url: "",
      contactUrl: "",
      connections: [
        {
          id: randomUUID(),
          type: "website",
          url: "https://web.telegram.org/a/#fixture",
          label: "Telegram web",
        },
      ],
    },
  });
  const editedLinked = await anon(`/listings/${linked.id}`);
  assert.deepEqual(editedLinked.tags, ["Telegram"]);
  await staff(`/listings/${linked.id}/restore`, "POST", {
    version: editedLinked.version,
    targetVersion: initialLinked.version,
    reason: "Restore original linked destination",
  });
  assert.deepEqual((await anon(`/listings/${linked.id}`)).tags, ["Facebook"]);
  console.log(
    "Tag permissions, aliases, migration, AND filters, retirement, merge, restore and audit passed.",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  store?.close();
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}

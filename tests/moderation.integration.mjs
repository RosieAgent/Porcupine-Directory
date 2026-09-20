// Run: node --import tsx tests/moderation.integration.mjs
// Only a random isolated schema is mutated. No production migration runner, jobs or Docker.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import pg from "pg";
import { ZodError } from "zod";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL for tests.");
const schema = "moderation_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({
  connectionString: url,
  connectionTimeoutMillis: 5000,
});
const scoped = new URL(url);
scoped.searchParams.set("options", "-c search_path=" + schema);
Object.assign(process.env, {
  DATABASE_URL: scoped.toString(),
  DATABASE_SCHEMA: schema,
  APP_ORIGIN: "http://localhost:4350",
  SESSION_SECRET: randomUUID() + randomUUID(),
  PASSKEYS_ENABLED: "false",
  STAFF_AUTH_MODE: "password_recent",
});
let pool, store, server;
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  ({ pool } = await import("../server/db.ts"));
  assert.equal(
    (await pool.query("SELECT current_schema() AS name")).rows[0].name,
    schema,
  );
  // gen_random_uuid is built into PostgreSQL; don't install extensions outside the fixture.
  await pool.query(
    (await readFile("db/init/001_schema.sql", "utf8")).replace(
      "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
      "",
    ),
  );
  for (const name of [
    "002_event_sync",
    "003_accounts",
    "004_account_setup",
    "005_connections",
    "006_connection_revisions",
    "007_entry_context",
    "008_joining_placeholders",
    "009_publications",
    "013_moderation",
  ])
    await pool.query(await readFile(`db/migrations/${name}.sql`, "utf8"));
  const security = await import("../server/security.ts");
  store = security.sessionStore;
  const { moderation } = await import("../server/routes/moderation.ts");
  const { listings } = await import("../server/routes/listings.ts");
  const app = express();
  app.use(express.json(), security.sessions, security.loadAccount);
  app.get("/api/auth/csrf", (req, res) =>
    res.json({ token: security.generateToken(req) }),
  );
  // Test-only session fixture; protected endpoints still use real account loading and authorization.
  app.post("/fixture/session", (req, res) => {
    req.session.accountId = req.body.id;
    req.session.version = req.body.version ?? 1;
    req.session.passwordAuthenticatedAt = req.body.at ?? Date.now();
    req.session.strongAt = req.body.strongAt;
    res.json({ ok: true });
  });
  app.use("/api/moderation", moderation);
  app.use("/api/listings", listings);
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((error, _req, res, _next) => {
    const status =
      error instanceof ZodError
        ? 400
        : error.code === "EBADCSRFTOKEN"
          ? 403
          : (error.status ?? 500);
    if (status === 500) console.error(error);
    res
      .status(status)
      .json({ error: status === 500 ? "Request failed" : error.message });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  function browser() {
    let cookie = "";
    return {
      async call(path, method = "GET", body, expected = 200, options = {}) {
        const headers = {
          cookie,
          "Content-Type": "application/json",
          ...options.headers,
        };
        if (method !== "GET" && !options.noCsrf) {
          const csrf = await fetch(base + "/api/auth/csrf", {
            headers: { cookie },
          });
          cookie = csrf.headers.get("set-cookie")?.split(";")[0] || cookie;
          headers.cookie = cookie;
          headers["X-CSRF-Token"] = (await csrf.json()).token;
        }
        const response = await fetch(base + path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
        const data = await response.json();
        assert.equal(
          response.status,
          expected,
          `${method} ${path}: ${JSON.stringify(data)}`,
        );
        if (path.startsWith("/api/moderation"))
          assert.equal(response.headers.get("cache-control"), "no-store");
        return data;
      },
    };
  }
  const anon = browser(),
    editor = browser(),
    otherEditor = browser(),
    user = browser();
  async function account(role) {
    return (
      await pool.query(
        "INSERT INTO accounts(username,password_hash,recovery_hash,recovery_saved,role) VALUES($1,'fixture','fixture',true,$2) RETURNING id",
        [randomUUID(), role],
      )
    ).rows[0].id;
  }
  const editorId = await account("editor"),
    otherEditorId = await account("administrator"),
    userId = await account("user");
  await editor.call("/fixture/session", "POST", { id: editorId });
  await otherEditor.call("/fixture/session", "POST", { id: otherEditorId });
  await user.call("/fixture/session", "POST", { id: userId });
  async function listing(name, overrides = {}) {
    const row = {
      status: "published",
      instructions: "Visit the public meeting at town hall every Monday.",
      self: null,
      reviewed: null,
      ...overrides,
    };
    return (
      await pool.query(
        `INSERT INTO listings(kind,name,summary,status,access_instructions,self_confirmed_at,editor_reviewed_at,owner_id)
      VALUES('group',$1,'Fixture entry',$2,$3,$4,$5,$6) RETURNING id,version`,
        [name, row.status, row.instructions, row.self, row.reviewed, userId],
      )
    ).rows[0];
  }
  const fresh = new Date().toISOString(),
    stale = new Date(Date.now() - 181 * 86400000).toISOString();
  const target = await listing("Reported fixture", { reviewed: fresh });
  const hidden = await listing("Hidden fixture", { status: "archived" });
  const pending = await listing("Pending fixture", {
    status: "pending_review",
  });
  const missing = await listing("Missing fixture", {
    instructions: "Ask to join",
    self: fresh,
  });
  const old = await listing("Stale fixture", { self: stale });
  const mixed = await listing("Fresh review overrides old confirmation", {
    self: stale,
    reviewed: fresh,
  });
  for (let i = 0; i < 14; i++) await listing(`Unconfirmed ${i}`);
  const before = (
    await pool.query("SELECT to_jsonb(l) AS data FROM listings l WHERE id=$1", [
      target.id,
    ])
  ).rows[0].data;
  const publicBefore = await anon.call(`/api/listings/${target.id}`);
  const rankingBefore = (
    await anon.call("/api/listings?pageSize=48")
  ).items.map((entry) => entry.id);
  const report = {
    listingId: target.id,
    reason: "incorrect",
    text: "Fixture issue details.",
  };
  await anon.call("/api/moderation/reports", "POST", report, 403, {
    noCsrf: true,
  });
  await anon.call("/api/moderation/reports", "POST", report, 403, {
    headers: { Origin: "https://external.invalid" },
  });
  await anon.call(
    "/api/moderation/reports",
    "POST",
    { ...report, reason: "arbitrary" },
    400,
  );
  await anon.call(
    "/api/moderation/reports",
    "POST",
    { ...report, text: "x".repeat(501) },
    400,
  );
  await anon.call(
    "/api/moderation/reports",
    "POST",
    { ...report, accountId: userId },
    400,
  );
  await pool.query("DELETE FROM rate_buckets");
  const receipt = await anon.call(
    "/api/moderation/reports",
    "POST",
    report,
    202,
  );
  assert.deepEqual(Object.keys(receipt), ["message"]);
  for (const body of [
    { ...report, listingId: hidden.id },
    { ...report, listingId: pending.id },
    { ...report, listingId: randomUUID() },
    { ...report, website: "spam.invalid" },
  ])
    assert.deepEqual(
      await anon.call("/api/moderation/reports", "POST", body, 202),
      receipt,
    );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM moderation_reports"))
      .rows[0].n,
    1,
  );
  await anon.call("/api/moderation/reports", "POST", report, 429);
  // IP bucket also limits a new anonymous session.
  await browser().call("/api/moderation/reports", "POST", report, 429);
  await pool.query("DELETE FROM rate_buckets");
  assert.deepEqual(
    await anon.call(
      "/api/moderation/reports",
      "POST",
      { listingId: target.id, reason: "broken_link" },
      202,
    ),
    receipt,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT to_jsonb(l) AS data FROM listings l WHERE id=$1",
        [target.id],
      )
    ).rows[0].data,
    before,
  );
  assert.deepEqual(await anon.call(`/api/listings/${target.id}`), publicBefore);
  assert.deepEqual(
    (await anon.call("/api/listings?pageSize=48")).items.map(
      (entry) => entry.id,
    ),
    rankingBefore,
  );
  assert.ok(!JSON.stringify(publicBefore).includes(userId));
  for (const client of [anon, user]) {
    await client.call("/api/moderation/queue", "GET", undefined, 403);
    await client.call(
      `/api/moderation/entries/${target.id}/reports`,
      "GET",
      undefined,
      403,
    );
  }
  for (const [filter, includes, excludes] of [
    ["reported", [target.id], [hidden.id]],
    ["pending", [pending.id], [target.id]],
    ["missing", [missing.id], [target.id]],
    ["stale", [old.id], [mixed.id, target.id]],
    ["unconfirmed", [pending.id], [old.id, target.id, hidden.id]],
  ]) {
    const queue = await editor.call(
      `/api/moderation/queue?filter=${filter}&pageSize=48`,
    );
    const ids = queue.items.map((entry) => entry.id);
    for (const id of includes)
      assert.ok(ids.includes(id), `${filter} includes ${id}`);
    for (const id of excludes)
      assert.ok(!ids.includes(id), `${filter} excludes ${id}`);
    assert.ok(!JSON.stringify(queue).includes(userId));
  }
  const first = await editor.call("/api/moderation/queue?pageSize=12");
  const second = await editor.call("/api/moderation/queue?pageSize=12&page=2");
  assert.equal(first.items.length, 12);
  assert.ok(second.items.length > 0);
  assert.equal(
    new Set([...first.items, ...second.items].map((entry) => entry.id)).size,
    first.total,
  );
  assert.deepEqual(
    await editor.call("/api/moderation/queue?pageSize=12"),
    first,
  );
  await editor.call("/api/moderation/queue?page=0", "GET", undefined, 400);
  await editor.call(
    "/api/moderation/queue?filter=invalid",
    "GET",
    undefined,
    400,
  );
  let reports = await editor.call(
    `/api/moderation/entries/${target.id}/reports`,
  );
  assert.equal(reports.total, 2);
  const selected = reports.items[0];
  const resolvePath = `/api/moderation/reports/${selected.id}/resolve`;
  const decision = {
    version: selected.version,
    listingVersion: target.version,
    outcome: "resolved",
    resolution: "Checked and corrected via editor.",
  };
  await anon.call(
    `/api/moderation/reports/${selected.id}`,
    "GET",
    undefined,
    403,
  );
  await anon.call(resolvePath, "POST", decision, 403);
  await user.call(resolvePath, "POST", decision, 403);
  await editor.call(resolvePath, "POST", decision, 403, { noCsrf: true });
  await editor.call("/fixture/session", "POST", {
    id: editorId,
    at: Date.now() - 16 * 60000,
  });
  await editor.call("/api/moderation/queue", "GET", undefined, 403);
  await editor.call(
    `/api/moderation/entries/${target.id}/reports`,
    "GET",
    undefined,
    403,
  );
  await editor.call(resolvePath, "POST", decision, 403);
  await editor.call("/fixture/session", "POST", { id: editorId });
  for (const column of ["privileges_suspended", "recovery_saved"]) {
    await pool.query(`UPDATE accounts SET ${column}=$2 WHERE id=$1`, [
      editorId,
      column === "privileges_suspended",
    ]);
    await editor.call("/api/moderation/queue", "GET", undefined, 403);
    await editor.call(resolvePath, "POST", decision, 403);
    await pool.query(`UPDATE accounts SET ${column}=$2 WHERE id=$1`, [
      editorId,
      column !== "privileges_suspended",
    ]);
  }
  await editor.call(resolvePath, "POST", { ...decision, version: 99 }, 409);
  await editor.call(resolvePath, "POST", { ...decision, resolution: " " }, 400);
  await pool.query(
    "UPDATE listings SET summary='Changed while reviewing' WHERE id=$1",
    [target.id],
  );
  await editor.call(resolvePath, "POST", decision, 409);
  reports = await editor.call(`/api/moderation/entries/${target.id}/reports`);
  const currentDecision = {
    ...decision,
    listingVersion: reports.listing.version,
  };
  // Two editors race to resolve the same version: exactly one succeeds and one conflicts.
  const results = await Promise.allSettled([
    editor.call(resolvePath, "POST", currentDecision),
    otherEditor.call(resolvePath, "POST", currentDecision),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.actual, 409);
  await editor.call(resolvePath, "POST", currentDecision, 409);
  const audit = (
    await pool.query(
      "SELECT * FROM moderation_report_audit WHERE report_id=$1",
      [selected.id],
    )
  ).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].version, 2);
  assert.equal(audit[0].listing_version, reports.listing.version);
  assert.ok([editorId, otherEditorId].includes(audit[0].actor_id));
  assert.equal(
    (
      await editor.call(
        `/api/moderation/entries/${target.id}/reports?status=resolved`,
      )
    ).total,
    1,
  );
  const remaining = (
    await editor.call(`/api/moderation/entries/${target.id}/reports`)
  ).items[0];
  await editor.call(`/api/moderation/reports/${remaining.id}/resolve`, "POST", {
    ...currentDecision,
    version: remaining.version,
    outcome: "dismissed",
    resolution: "Duplicate issue already reviewed.",
  });
  assert.equal(
    (await editor.call("/api/moderation/queue?filter=reported")).total,
    0,
  );
  const after = (
    await pool.query(
      "SELECT version,editor_reviewed_at,status FROM listings WHERE id=$1",
      [target.id],
    )
  ).rows[0];
  assert.equal(after.version, reports.listing.version);
  assert.equal(after.editor_reviewed_at, null);
  assert.equal(after.status, "published");
  // Policy changes are enforced without using a stale session's role/verification.
  process.env.STAFF_AUTH_MODE = "passkey";
  await editor.call("/api/moderation/queue", "GET", undefined, 403);
  await editor.call("/fixture/session", "POST", {
    id: editorId,
    strongAt: Date.now(),
  });
  await editor.call("/api/moderation/queue");
  await pool.query(
    "UPDATE accounts SET session_version=session_version+1 WHERE id=$1",
    [editorId],
  );
  await editor.call("/api/moderation/queue", "GET", undefined, 403);
  console.log(
    "PASS: anonymous receipts, validation, CSRF/origin/honeypot/rate limits, private staff review, filters/pagination, unchanged ranking/trust, stale versions, concurrent resolution and atomic audit.",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (store) store.close();
  if (pool) await pool.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}

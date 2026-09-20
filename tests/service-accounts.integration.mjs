import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL for tests.");
const schema = "service_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: url });
const scoped = new URL(url);
scoped.searchParams.set("options", "-c search_path=" + schema);
process.env.DATABASE_URL = scoped.toString();
process.env.DATABASE_SCHEMA = schema;
process.env.START_SERVER = "false";
process.env.RUN_MIGRATIONS = "false";
process.env.APP_ENVIRONMENT = "staging";
process.env.APP_ORIGIN = "http://localhost:4352";
process.env.SESSION_SECRET = randomUUID() + randomUUID();

let server;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const { pool } = await import("../dist-server/server/db.js");
  await pool.query(await readFile("db/init/001_schema.sql", "utf8"));
  const { migrate } = await import("../dist-server/server/migrate.js");
  await migrate();
  const { app } = await import("../dist-server/server/index.js");
  const { createServiceTokenValue, hashServiceToken } =
    await import("../dist-server/server/service-accounts.js");
  const listing = (
    await pool.query(
      `INSERT INTO listings(kind,name,summary,description,status,url,contact_url)
       VALUES ('group','Service test listing','A listing for service-account tests.','Original description','published','https://example.test','https://example.test/contact')
       RETURNING id,version`,
    )
  ).rows[0];
  const token = createServiceTokenValue();
  const readOnlyToken = createServiceTokenValue();
  const productionToken = createServiceTokenValue();
  await pool.query(
    `INSERT INTO service_accounts(name,environment,scopes,token_hash,token_prefix,expires_at)
     VALUES
       ('test-writer','staging',ARRAY['listings:read','listings:write'],$1,$2,now()+interval '1 day'),
       ('test-reader','staging',ARRAY['listings:read'],$3,$4,now()+interval '1 day'),
       ('test-writer','production',ARRAY['listings:read','listings:write'],$5,$6,now()+interval '1 day')`,
    [
      hashServiceToken(token),
      token.slice(0, 16),
      hashServiceToken(readOnlyToken),
      readOnlyToken.slice(0, 16),
      hashServiceToken(productionToken),
      productionToken.slice(0, 16),
    ],
  );
  server = app.listen(4352, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:4352/api/v1";
  async function call(
    path,
    method = "GET",
    body,
    suppliedToken = token,
    headers = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(suppliedToken ? { Authorization: `Bearer ${suppliedToken}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    return { response, data };
  }
  let result = await call(`/listings/${listing.id}`, "GET", undefined, null);
  assert.equal(result.response.status, 401);
  result = await call(
    `/listings/${listing.id}`,
    "GET",
    undefined,
    productionToken,
  );
  assert.equal(result.response.status, 401);
  result = await call(`/listings/${listing.id}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.name, "Service test listing");
  assert.equal("owner_id" in result.data, false);
  result = await call(
    `/listings/${listing.id}`,
    "PATCH",
    {
      expectedVersion: 1,
      changes: { description: "This unauthenticated write must be rejected." },
      reason: "Unauthenticated write rejection test",
    },
    null,
    { "Idempotency-Key": "service-test-no-token" },
  );
  assert.equal(result.response.status, 401);
  const patch = {
    expectedVersion: 1,
    changes: {
      description: "Updated by the service account.",
      tags: [],
      referenceSources: [
        {
          label: "Service test source",
          url: "https://example.test/source",
          checkedAt: "2026-09-20T00:00:00.000Z",
        },
      ],
    },
    reason: "Reviewed against the source and corrected the description.",
    context: {
      what: "Updated the public description",
      why: "The previous wording was stale",
      how: "Compared the entry with the source",
      sourceLabel: "Service test source",
    },
  };
  result = await call(`/listings/${listing.id}`, "PATCH", patch, token, {
    "Idempotency-Key": "service-test-update-1",
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.version, 2);
  const repeated = await call(
    `/listings/${listing.id}`,
    "PATCH",
    patch,
    token,
    { "Idempotency-Key": "service-test-update-1" },
  );
  assert.deepEqual(repeated.data, result.data);
  const stale = await call(
    `/listings/${listing.id}`,
    "PATCH",
    { ...patch, expectedVersion: 1, reason: "A different request" },
    token,
    { "Idempotency-Key": "service-test-update-2" },
  );
  assert.equal(stale.response.status, 409);
  const readOnly = await call(
    `/listings/${listing.id}`,
    "PATCH",
    patch,
    readOnlyToken,
    { "Idempotency-Key": "service-test-reader-write" },
  );
  assert.equal(readOnly.response.status, 403);
  const revisions = await pool.query(
    `SELECT actor_type,action,reason,details FROM listing_revisions
     WHERE listing_id=$1 AND version=2`,
    [listing.id],
  );
  assert.equal(revisions.rows[0].actor_type, "service_account");
  assert.equal(revisions.rows[0].action, "service.listing.updated");
  assert.deepEqual(revisions.rows[0].details.changedFields, [
    "description",
    "tags",
    "referenceSources",
  ]);
  const preserved = await pool.query(
    `SELECT contact_url AS "contactUrl",reference_sources AS "referenceSources"
     FROM listings WHERE id=$1`,
    [listing.id],
  );
  assert.equal(preserved.rows[0].contactUrl, "https://example.test/contact");
  assert.deepEqual(preserved.rows[0].referenceSources, [
    {
      label: "Service test source",
      url: "https://example.test/source",
      checkedAt: "2026-09-20T00:00:00.000Z",
    },
  ]);
  const audit = await pool.query(
    `SELECT actor_type,subject_type,action,reason FROM security_audit
     WHERE subject_id=$1 ORDER BY id DESC LIMIT 1`,
    [listing.id],
  );
  assert.deepEqual(audit.rows[0], {
    actor_type: "service_account",
    subject_type: "listing",
    action: "listing.updated",
    reason: patch.reason,
  });
  const updated = await call(`/listings/${listing.id}`);
  assert.equal(updated.data.description, patch.changes.description);
  assert.equal(updated.data.contactUrl, "https://example.test/contact");
  assert.deepEqual(
    updated.data.referenceSources,
    patch.changes.referenceSources,
  );
  console.log(
    "Service-account integration passed: scoped reads, immediate listing writes, idempotency, stale-version rejection and audit attribution.",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => undefined);
  await admin.end();
}

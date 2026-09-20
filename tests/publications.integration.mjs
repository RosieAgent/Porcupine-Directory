// Disposable schema; no live listings or cached episodes are changed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL for tests.");
const admin = new pg.Pool({ connectionString: url });
const schema = "publication_test_" + randomUUID().replaceAll("-", "");
const scoped = new URL(url);
scoped.searchParams.set("options", "-c search_path=" + schema);
process.env.DATABASE_URL = scoped.toString();
let pool;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  ({ pool } = await import("../dist-server/server/db.js"));
  await pool.query(
    await readFile("db/migrations/009_publications.sql", "utf8"),
  );
  const { syncPublications, getPublications } =
    await import("../dist-server/server/publications.js");
  const items = [
    {
      title: "Fixture episode",
      url: "https://anchor.fm/fixture",
      publishedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return items;
  };
  await Promise.all([syncPublications(fetcher), syncPublications(fetcher)]);
  assert.equal(calls, 1);
  const first = await getPublications();
  assert.equal(first.status, "ok");
  assert.deepEqual(first.items, items);
  await syncPublications(fetcher);
  assert.equal(calls, 1, "API traffic/restarts cannot force repeated polling");
  await pool.query(
    "UPDATE publication_feeds SET last_checked_at=now()-interval '2 hours'",
  );
  await syncPublications(async () => {
    throw new Error("Upstream down");
  });
  const stale = await getPublications();
  assert.equal(stale.status, "error");
  assert.deepEqual(stale.items, items);
  assert.equal(
    stale.lastSuccessfulAt.toISOString(),
    first.lastSuccessfulAt.toISOString(),
  );
  process.env.PUBLICATION_SYNC_ENABLED = "false";
  assert.equal((await getPublications()).status, "disabled");
  console.log(
    "Publication cache: concurrency, hourly gate, preserved failures and disabled state passed.",
  );
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}

// Runs in a temporary schema inside THIS project's database, never against FSP.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgres://porcupine:porcupine@127.0.0.1:5438/porcupine_directory";
const schema = "sync_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: url });
const scoped = new URL(url);
scoped.searchParams.set("options", "-c search_path=" + schema);
process.env.DATABASE_URL = scoped.toString();
const { pool } = await import("../dist-server/server/db.js");
const { syncEventSource } = await import("../dist-server/server/event-sync.js");
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await pool.query(await readFile("db/init/001_schema.sql", "utf8"));
  await pool.query(await readFile("db/migrations/002_event_sync.sql", "utf8"));
  await pool.query(await readFile("db/migrations/003_accounts.sql", "utf8"));
  await pool.query(
    await readFile("db/migrations/012_event_locations.sql", "utf8"),
  );
  const from = new Date("2026-09-01T00:00Z"),
    to = new Date("2026-12-01T00:00Z");
  const row = {
    key: "1:one",
    title: "First title",
    description: "Public meetup",
    startsAt: new Date("2026-10-01T22:00Z"),
    endsAt: new Date("2026-10-01T23:00Z"),
    venue: "Test",
    address: "10 Main St",
    city: "Concord",
    state: "NH",
    postalCode: "03301",
    country: "USA",
    locationType: "physical",
    url: "https://example.org/event",
    allDay: false,
  };
  let snapshot = { from, to, skipped: [], events: [row] };
  const adapter = {
    key: "fsp_calendar",
    name: "Test feed",
    url: "https://example.org",
    fetchSnapshot: async () => snapshot,
  };
  assert.equal((await syncEventSource(adapter)).status, "ok");
  assert.deepEqual(
    (
      await pool.query(
        "SELECT address,city,state,postal_code,country,location_type FROM events",
      )
    ).rows[0],
    {
      address: "10 Main St",
      city: "Concord",
      state: "NH",
      postal_code: "03301",
      country: "USA",
      location_type: "physical",
    },
  );
  const original = (await pool.query("SELECT id,last_synced_at FROM events"))
    .rows[0];
  assert.equal((await syncEventSource(adapter)).status, "not_due");
  snapshot = { ...snapshot, events: [{ ...row, title: "Updated title" }] };
  await syncEventSource(adapter, true);
  assert.equal(
    (await pool.query("SELECT id FROM events")).rows[0].id,
    original.id,
  );
  const success = (
    await pool.query(
      "SELECT * FROM source_syncs WHERE source_key='fsp_calendar'",
    )
  ).rows[0];
  await assert.rejects(() =>
    syncEventSource(
      {
        ...adapter,
        fetchSnapshot: async () => {
          throw Error("Upstream offline");
        },
      },
      true,
    ),
  );
  const failed = (
    await pool.query(
      "SELECT * FROM source_syncs WHERE source_key='fsp_calendar'",
    )
  ).rows[0];
  assert.equal(failed.last_status, "error");
  assert.equal(
    failed.last_successful_at.toISOString(),
    success.last_successful_at.toISOString(),
  );
  assert.equal(
    (await pool.query("SELECT title FROM events")).rows[0].title,
    "Updated title",
  );
  assert.equal((await syncEventSource(adapter)).status, "not_due");
  const diagnostic = {
    sourceEventId: "1",
    code: "invalid_weekday",
    reason: "BYDAY=3S requires source correction.",
  };
  snapshot = {
    ...snapshot,
    skipped: ["1"],
    diagnostics: [diagnostic],
    events: [],
  };
  assert.equal((await syncEventSource(adapter, true)).status, "partial");
  assert.deepEqual(
    (
      await pool.query(
        "SELECT skipped_diagnostics FROM source_syncs WHERE source_key='fsp_calendar'",
      )
    ).rows[0].skipped_diagnostics,
    [diagnostic],
  );
  assert.equal(
    (await pool.query("SELECT raw_payload FROM events")).rows[0].raw_payload
      .hidden,
    undefined,
  );
  snapshot = { ...snapshot, skipped: [] };
  await syncEventSource(adapter, true);
  assert.equal(
    (await pool.query("SELECT raw_payload FROM events")).rows[0].raw_payload
      .hidden,
    true,
  );
  // An interrupted process releases its DB lock; its running status is recovered immediately.
  await pool.query("UPDATE source_syncs SET last_status='running'");
  assert.equal((await syncEventSource(adapter)).status, "ok");
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const pending = syncEventSource(
    {
      ...adapter,
      fetchSnapshot: async () => {
        started();
        await gate;
        return snapshot;
      },
    },
    true,
  );
  await ready;
  assert.equal(
    (await syncEventSource(adapter, true)).status,
    "already_running",
  );
  finish();
  await pending;
  // Constraint failure mid-write rolls back the entire snapshot and its timestamps.
  snapshot = {
    ...snapshot,
    events: [row, { ...row, key: "2:bad", title: null }],
  };
  await assert.rejects(() => syncEventSource(adapter, true));
  assert.equal(
    (await pool.query("SELECT raw_payload FROM events")).rows[0].raw_payload
      .hidden,
    true,
  );
  console.log(
    "PASS: hourly due checks, idempotency, failure retention, partial rules, cancellations, interrupted-run recovery, overlap lock, atomic rollback.",
  );
} finally {
  await pool.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}

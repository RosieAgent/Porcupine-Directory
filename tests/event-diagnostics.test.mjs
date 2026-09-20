import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../dist-server/server/db.js";
import { eventSyncDiagnostics } from "../dist-server/server/routes/event-sync-diagnostics.js";
import { events } from "../dist-server/server/routes/events.js";
import { eventSyncDiagnosticsResponse } from "../dist-server/shared/event-sync-diagnostics.js";

test("sync diagnostics are uncached and require a freshly verified, active administrator", async () => {
  const originalQuery = pool.query;
  const previousMode = process.env.STAFF_AUTH_MODE;
  process.env.STAFF_AUTH_MODE = "password_recent";
  let queries = 0;
  pool.query = async (sql, values) => {
    queries++;
    assert.match(sql, /skipped_diagnostics AS skipped/);
    assert.doesNotMatch(sql, /last_error|raw_payload/);
    assert.deepEqual(values, [["fsp_calendar"]]);
    return {
      rows: [
        {
          sourceKey: "fsp_calendar",
          status: "partial",
          lastCheckedAt: new Date("2026-09-19T12:00Z"),
          lastFinishedAt: new Date("2026-09-19T12:01Z"),
          diagnosticsAt: new Date("2026-09-19T12:01Z"),
          skippedCount: 1,
          skipped: [
            {
              sourceEventId: "6147",
              code: "invalid_weekday",
              reason: "BYDAY=3S requires source correction.",
            },
          ],
        },
      ],
    };
  };
  const app = express();
  // Test-only identity injection, exercising the actual production guard/router.
  app.use((req, _res, next) => {
    const role = req.get("x-test-role");
    req.session = {
      passwordAuthenticatedAt: req.get("x-test-stale") ? 1 : Date.now(),
    };
    if (role)
      req.account = {
        role,
        recoverySaved: !req.get("x-test-no-recovery"),
        privilegesSuspended: !!req.get("x-test-suspended"),
      };
    next();
  });
  app.use("/api/admin/event-sync", eventSyncDiagnostics);
  app.use("/api/events", events);
  app.use((error, _req, res, _next) =>
    res.status(error.status ?? 500).json({ error: error.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const headers of [
      {},
      { "x-test-role": "user" },
      { "x-test-role": "editor" },
      { "x-test-role": "administrator", "x-test-stale": "1" },
      { "x-test-role": "administrator", "x-test-suspended": "1" },
      { "x-test-role": "administrator", "x-test-no-recovery": "1" },
    ]) {
      const response = await fetch(`${base}/api/admin/event-sync`, { headers });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.ok(!JSON.stringify(await response.json()).includes("6147"));
    }
    assert.equal(queries, 0);
    const response = await fetch(`${base}/api/admin/event-sync`, {
      headers: { "x-test-role": "administrator" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const result = eventSyncDiagnosticsResponse.parse(await response.json());
    assert.equal(result.sources[0].skipped[0].sourceEventId, "6147");
    assert.equal(queries, 1);
    const publicResponse = await fetch(`${base}/api/events/diagnostics`);
    assert.equal(publicResponse.status, 404);
    assert.equal(queries, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    if (previousMode === undefined) delete process.env.STAFF_AUTH_MODE;
    else process.env.STAFF_AUTH_MODE = previousMode;
  }
});

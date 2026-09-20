import { Router } from "express";
import { pool } from "../db.js";
import { requireAdmin } from "../security.js";
import { eventSources } from "../../shared/event-sources.js";

// Mount at /api/admin/event-sync after sessions/loadAccount, before the API 404.
export const eventSyncDiagnostics = Router();
eventSyncDiagnostics.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
eventSyncDiagnostics.use(requireAdmin);
eventSyncDiagnostics.get("/", async (_req, res) => {
  const result = await pool.query(
    `SELECT source_key AS "sourceKey",last_status AS status,
    last_started_at AS "lastCheckedAt",last_finished_at AS "lastFinishedAt",
    diagnostics_at AS "diagnosticsAt",skipped_count AS "skippedCount",
    skipped_diagnostics AS skipped FROM source_syncs WHERE source_key=ANY($1::text[]) ORDER BY display_name`,
    [Object.keys(eventSources)],
  );
  res.json({ sources: result.rows });
});

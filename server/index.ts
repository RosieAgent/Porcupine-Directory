import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import {
  adapters,
  automaticSyncEnabled,
  startEventScheduler,
  syncEventSource,
} from "./event-sync.js";
import { migrate } from "./migrate.js";
import { POLL_INTERVAL_MS } from "../shared/event-sources.js";
import { listings } from "./routes/listings.js";
import { tags } from "./routes/tags.js";
import { ownership } from "./routes/ownership.js";
import { moderation } from "./routes/moderation.js";
import { events } from "./routes/events.js";
import helmet from "helmet";
import { ZodError } from "zod";
import {
  sessions,
  loadAccount,
  checkOrigin,
  csrfSynchronisedProtection,
  HttpError,
  requireAdmin,
  appOrigin,
} from "./security.js";
import { auth } from "./routes/auth.js";
import { accountRoutes, administration } from "./routes/accounts.js";
import { donationSettings } from "./donations.js";
import { getPublications, startPublicationScheduler } from "./publications.js";
import { PORCUPINE_REPORT_ID } from "../shared/publications.js";
import { createSharePreviewHandler } from "./share-preview.js";
import { eventSyncDiagnostics } from "./routes/event-sync-diagnostics.js";

export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "upgrade-insecure-requests": null,
      },
    },
  }),
);
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "100kb" }));
app.use("/api", sessions, loadAccount, checkOrigin, csrfSynchronisedProtection);
app.use("/api/auth", auth);
app.use("/api/account", accountRoutes);
app.use("/api/admin", administration);
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch {
    res.status(503).json({ ok: false, database: "unavailable" });
  }
});
app.use("/api/listings", listings);
app.use("/api/tags", tags);
app.use("/api/ownership", ownership);
app.use("/api/moderation", moderation);
app.use("/api/admin/event-sync", eventSyncDiagnostics);
app.use("/api/events", events);
app.get("/api/donations", (_req, res) => res.json(donationSettings()));
app.get("/api/publications/:id", async (req, res) => {
  if (
    req.params.id !== PORCUPINE_REPORT_ID ||
    !(
      await pool.query(
        "SELECT 1 FROM listings WHERE id=$1 AND status='published'",
        [PORCUPINE_REPORT_ID],
      )
    ).rowCount
  ) {
    res.status(404).json({ error: "Publication source unavailable." });
    return;
  }
  res.json(await getPublications());
});
app.get("/api/meta", async (_req, res) => {
  const result =
    await pool.query(`SELECT source_key AS "sourceKey",display_name AS "displayName",source_url AS "sourceUrl",
    last_successful_at AS "lastSyncedAt",last_started_at AS "lastCheckedAt",last_finished_at AS "lastFinishedAt",
    coverage_from AS "coverageFrom",coverage_to AS "coverageTo",skipped_count AS "skippedCount",
    last_status AS status,item_count AS "itemCount"
    FROM source_syncs ORDER BY display_name`);
  res.json({
    sources: result.rows.map((source) => {
      const scheduled =
        automaticSyncEnabled() &&
        adapters.some((a) => a.key === source.sourceKey);
      return {
        ...source,
        pollIntervalMinutes: scheduled ? POLL_INTERVAL_MS / 60000 : null,
        nextPollAt:
          scheduled && source.lastCheckedAt
            ? new Date(
                new Date(source.lastCheckedAt).getTime() + POLL_INTERVAL_MS,
              ).toISOString()
            : null,
      };
    }),
  });
});
app.post("/api/sync/fsp", requireAdmin, async (_req, res) => {
  res.json({ ok: true, ...(await syncEventSource(adapters[0], true)) });
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});
const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Please check the supplied fields.",
      details: error.flatten(),
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EBADCSRFTOKEN"
  ) {
    res
      .status(403)
      .json({ error: "Security token expired. Refresh and try again." });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid JSON body." });
    return;
  }
  // Do not log request bodies, credentials, tokens, or SQL parameter values.
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  res
    .status(500)
    .json({ error: "Unable to complete the request. Please try again." });
};
app.use(errors);
const dist = fileURLToPath(new URL("../../dist", import.meta.url));
app.use(express.static(dist, { index: false }));
const indexHtml = await readFile(path.join(dist, "index.html"), "utf8");
app.get(
  "/{*splat}",
  createSharePreviewHandler({ indexHtml, origin: appOrigin, db: pool }),
);
const port = Number(process.env.PORT ?? 3000);
await migrate();
if (process.env.START_SERVER !== "false") {
  const stopScheduler = startEventScheduler();
  const stopPublications = startPublicationScheduler();
  const server = app.listen(port, () =>
    console.log(`Porcupine Directory listening on port ${port}`),
  );
  async function shutdown() {
    await Promise.all([
      stopScheduler(),
      stopPublications(),
      new Promise<void>((resolve) => server.close(() => resolve())),
    ]);
    await pool.end();
  }
  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });
}

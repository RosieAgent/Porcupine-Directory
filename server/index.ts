import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { pool } from "./db.js";
import { syncFspCalendar } from "./fsp.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: "100kb" }));

const listingKinds = ["group", "channel", "business", "resource"] as const;
const accessModes = ["open", "public", "invite_only", "private", "unknown"] as const;

const listingSchema = z.object({
  kind: z.enum(listingKinds),
  name: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(10).max(280),
  description: z.string().trim().max(4000).default(""),
  url: z.string().url().max(1000).optional().or(z.literal("")),
  contactUrl: z.string().url().max(1000).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  accessMode: z.enum(accessModes).default("unknown"),
  accessInstructions: z.string().trim().max(1000).default("")
});

function cleanOptional(value: string | undefined) {
  return value && value.length > 0 ? value : null;
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch {
    res.status(503).json({ ok: false, database: "unavailable" });
  }
});

app.get("/api/listings", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const kind = typeof req.query.kind === "string" && listingKinds.includes(req.query.kind as (typeof listingKinds)[number]) ? req.query.kind : null;
  const accessMode = typeof req.query.access === "string" && accessModes.includes(req.query.access as (typeof accessModes)[number]) ? req.query.access : null;
  const params: unknown[] = [];
  const where = ["status = 'published'"];

  if (query) {
    params.push(query);
    where.push(`to_tsvector('english', coalesce(name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '') || ' ' || array_to_string(tags, ' ')) @@ plainto_tsquery('english', $${params.length})`);
  }
  if (kind) {
    params.push(kind);
    where.push(`kind = $${params.length}`);
  }
  if (accessMode) {
    params.push(accessMode);
    where.push(`access_mode = $${params.length}`);
  }

  try {
    const result = await pool.query(
      `SELECT id, kind, name, summary, description, url, contact_url AS "contactUrl", location, tags,
        access_mode AS "accessMode", access_instructions AS "accessInstructions", source_name AS "sourceName",
        source_url AS "sourceUrl", last_confirmed_at AS "lastConfirmedAt"
       FROM listings WHERE ${where.join(" AND ")} ORDER BY name ASC LIMIT 100`,
      params
    );
    res.json({ items: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load listings." });
  }
});

app.get("/api/events", async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : new Date().toISOString();
  try {
    const result = await pool.query(
      `SELECT id, title, description, starts_at AS "startsAt", ends_at AS "endsAt", venue, city, url,
        source_key AS "sourceKey"
       FROM events WHERE starts_at >= $1 ORDER BY starts_at ASC LIMIT 50`,
      [from]
    );
    res.json({ items: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load events." });
  }
});

app.post("/api/listings", async (req, res) => {
  const parsed = listingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the listing fields and try again.", details: parsed.error.flatten() });
    return;
  }

  const listing = parsed.data;
  try {
    const result = await pool.query(
      `INSERT INTO listings
        (kind, name, summary, description, url, contact_url, location, tags, access_mode, access_instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        listing.kind,
        listing.name,
        listing.summary,
        listing.description,
        cleanOptional(listing.url),
        cleanOptional(listing.contactUrl),
        cleanOptional(listing.location),
        listing.tags,
        listing.accessMode,
        listing.accessInstructions
      ]
    );
    res.status(201).json({ id: result.rows[0].id, status: "pending_review" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to submit this listing right now." });
  }
});

app.get("/api/meta", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT display_name AS "displayName", source_url AS "sourceUrl", last_finished_at AS "lastSyncedAt",
        last_status AS "status", item_count AS "itemCount" FROM source_syncs ORDER BY display_name`
    );
    res.json({ sources: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load source information." });
  }
});

app.post("/api/sync/fsp", async (req, res) => {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey || req.header("x-admin-api-key") !== configuredKey) {
    res.status(401).json({ error: "Admin API key required." });
    return;
  }
  const feedUrl = process.env.FSP_ICAL_URL;
  if (!feedUrl) {
    res.status(400).json({ error: "FSP_ICAL_URL is not configured. Confirm the approved feed URL first." });
    return;
  }
  try {
    await pool.query("UPDATE source_syncs SET last_started_at = NOW(), last_status = 'running', last_error = NULL WHERE source_key = 'fsp_calendar'");
    const count = await syncFspCalendar(feedUrl);
    res.json({ ok: true, count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown calendar sync error.";
    await pool.query("UPDATE source_syncs SET last_finished_at = NOW(), last_status = 'error', last_error = $1 WHERE source_key = 'fsp_calendar'", [message]);
    res.status(502).json({ error: message });
  }
});

const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(distPath, "index.html")));

app.listen(port, () => {
  console.log(`Porcupine Directory listening on http://localhost:${port}`);
});

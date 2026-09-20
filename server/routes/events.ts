import { Router } from "express";
import { z } from "zod";
import {
  calendarQuerySchema,
  eventQuerySchema,
} from "../../shared/contracts.js";
import { calendarRange } from "../../shared/calendar.js";
import { pool } from "../db.js";

export const events = Router();
const columns = `id,title,description,starts_at AS "startsAt",ends_at AS "endsAt",venue,city,url,
  address,state,postal_code AS "postalCode",country,location_type AS "locationType",
  source_key AS "sourceKey",coalesce((raw_payload->>'allDay')::boolean,false) AS "allDay",
  coalesce((raw_payload->>'hidden')::boolean,false) AS hidden,last_synced_at AS "lastSyncedAt"`;
events.get("/", async (req, res) => {
  const parsed = eventQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid event filters or date range." });
    return;
  }
  const { q, from, to, page, pageSize } = parsed.data;
  const params: unknown[] = [];
  const where = ["coalesce(raw_payload->>'hidden','false') <> 'true'"];
  const bind = (value: unknown) => {
    params.push(value);
    return "$" + params.length;
  };
  where.push(
    from
      ? `coalesce(ends_at,starts_at) >= (${bind(from)}::date::timestamp AT TIME ZONE 'America/New_York')`
      : "coalesce(ends_at,starts_at) >= NOW()",
  );
  if (to)
    where.push(
      `starts_at < ((${bind(to)}::date + 1)::timestamp AT TIME ZONE 'America/New_York')`,
    );
  if (q) {
    const p = bind("%" + q + "%");
    where.push(
      `(title ILIKE ${p} OR description ILIKE ${p} OR venue ILIKE ${p} OR city ILIKE ${p} OR address ILIKE ${p})`,
    );
  }
  const filter = where.join(" AND ");
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM events WHERE ${filter}`,
    params,
  );
  const limit = bind(pageSize);
  const offset = bind((page - 1) * pageSize);
  const result = await pool.query(
    `SELECT ${columns} FROM events WHERE ${filter} ORDER BY starts_at,id LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ items: result.rows, total: count.rows[0].total, page, pageSize });
});
events.get("/calendar", async (req, res) => {
  const parsed = calendarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid calendar month or search." });
    return;
  }
  const { month, q } = parsed.data;
  const { from, to } = calendarRange(month);
  const result = await pool.query(
    `SELECT ${columns} FROM events WHERE coalesce(raw_payload->>'hidden','false') <> 'true'
    AND coalesce(ends_at,starts_at)>=$1 AND starts_at<$2
    AND ($3='' OR title ILIKE $4 OR description ILIKE $4 OR venue ILIKE $4 OR city ILIKE $4 OR address ILIKE $4)
    ORDER BY starts_at,id LIMIT 1001`,
    [from, to, q, "%" + q + "%"],
  );
  if (result.rows.length > 1000) {
    res.status(422).json({
      error:
        "Too many events for the calendar. Narrow your search or use the paginated list.",
    });
    return;
  }
  res.json({ items: result.rows, month });
});
events.get("/:id", async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  // Old shared links remain readable even when an occurrence leaves the current feed.
  const result = await pool.query(`SELECT ${columns} FROM events WHERE id=$1`, [
    req.params.id,
  ]);
  if (!result.rows.length) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  res.json(result.rows[0]);
});

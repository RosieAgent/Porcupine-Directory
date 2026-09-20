import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import {
  HttpError,
  requireStaff,
  transaction,
  limit,
  csrfSynchronisedProtection,
  checkOrigin,
  assertStaff,
} from "../security.js";
import {
  reportIssueSchema,
  reportReceipt,
  queueQuerySchema,
  resolveReportSchema,
} from "../../shared/moderation.js";
import { CONFIRMATION_FRESH_DAYS } from "../../shared/trust.js";

export const moderation = Router();
moderation.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
// Also protect this router when mounted in an isolated host/test application.
moderation.use(checkOrigin, csrfSynchronisedProtection);
moderation.post(
  "/reports",
  limit("moderation-report", 5, 60),
  async (req, res) => {
    const data = reportIssueSchema.parse(req.body);
    if (!data.website) {
      // A missing/private entry and a honeypot submission receive the identical receipt.
      await pool.query(
        `INSERT INTO moderation_reports(listing_id,reason,text)
       SELECT id,$2,$3 FROM listings WHERE id=$1 AND status='published'`,
        [data.listingId, data.reason, data.text],
      );
    }
    res.status(202).json(reportReceipt);
  },
);

// Everything below this point is private, including report IDs and existence.
moderation.use(requireStaff);
const flags = `SELECT id,name,kind,status,version,
  (self_confirmed_at IS NULL AND editor_reviewed_at IS NULL) AS unconfirmed,
  NOT listing_has_joining_details(connections,access_instructions,public_phone,public_email) AS missing,
  ((self_confirmed_at IS NOT NULL OR editor_reviewed_at IS NOT NULL) AND NOT (
    COALESCE(self_confirmed_at > now()-($1*interval '1 day') AND self_confirmed_at <= now(),false) OR
    COALESCE(editor_reviewed_at > now()-($1*interval '1 day') AND editor_reviewed_at <= now(),false)
  )) AS stale,
  EXISTS(SELECT 1 FROM moderation_reports r WHERE r.listing_id=listings.id AND r.status='open') AS reported,
  (status='pending_review') AS pending,created_at
  FROM listings`;
moderation.get("/queue", async (req, res) => {
  const { filter, page, pageSize } = queueQuerySchema.parse(req.query);
  // Static allowlist identifiers; report volume never influences ordering.
  const predicate =
    filter === "all"
      ? "(unconfirmed OR missing OR stale OR reported OR pending)"
      : filter;
  const where = `(status<>'archived' OR reported) AND ${predicate}`;
  const data = await transaction(async (client) => {
    await client.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const count = await client.query(
      `WITH entries AS (${flags}) SELECT count(*)::int AS total FROM entries WHERE ${where}`,
      [CONFIRMATION_FRESH_DAYS],
    );
    const { rows } = await client.query(
      `WITH entries AS (${flags}) SELECT id,name,kind,status,version,unconfirmed,missing,stale,reported,pending
       FROM entries WHERE ${where} ORDER BY created_at,id LIMIT $2 OFFSET $3`,
      [CONFIRMATION_FRESH_DAYS, pageSize, (page - 1) * pageSize],
    );
    return { items: rows, total: count.rows[0].total, page, pageSize };
  });
  res.json(data);
});
moderation.get("/entries/:id/reports", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { page, pageSize } = queueQuerySchema.parse(req.query);
  const status = z
    .enum(["open", "resolved", "dismissed", "all"])
    .default("open")
    .parse(req.query.status);
  const data = await transaction(async (client) => {
    await client.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const listing = await client.query(
      "SELECT id,name,version FROM listings WHERE id=$1",
      [id],
    );
    if (!listing.rows[0]) throw new HttpError(404, "Entry not found.");
    const where = "listing_id=$1 AND ($2='all' OR status=$2)";
    const count = await client.query(
      `SELECT count(*)::int AS total FROM moderation_reports WHERE ${where}`,
      [id, status],
    );
    const reports = await client.query(
      `SELECT id,reason,text,status,version,created_at AS "createdAt",resolved_at AS "resolvedAt",resolution
       FROM moderation_reports WHERE ${where} ORDER BY created_at,id LIMIT $3 OFFSET $4`,
      [id, status, pageSize, (page - 1) * pageSize],
    );
    return {
      listing: listing.rows[0],
      items: reports.rows,
      total: count.rows[0].total,
      page,
      pageSize,
    };
  });
  res.json(data);
});
moderation.post("/reports/:id/resolve", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const data = resolveReportSchema.parse(req.body);
  await transaction(async (client) => {
    // Serialize against role changes, recovery and session revocation.
    const account = await client.query(
      "SELECT role,recovery_saved,privileges_suspended,session_version FROM accounts WHERE id=$1 FOR SHARE",
      [req.account!.id],
    );
    const current = account.rows[0];
    if (!current || current.session_version !== req.session.version)
      throw new HttpError(401, "Please sign in again.");
    if (
      current.role === "user" ||
      current.privileges_suspended ||
      !current.recovery_saved
    )
      throw new HttpError(403, "This action requires an authorized editor.");
    assertStaff(req);
    const result = await client.query(
      "SELECT listing_id,version,status FROM moderation_reports WHERE id=$1 FOR UPDATE",
      [id],
    );
    const report = result.rows[0];
    if (!report) throw new HttpError(404, "Report not found.");
    const listing = await client.query(
      "SELECT version FROM listings WHERE id=$1 FOR SHARE",
      [report.listing_id],
    );
    if (
      report.version !== data.version ||
      report.status !== "open" ||
      listing.rows[0]?.version !== data.listingVersion
    )
      throw new HttpError(
        409,
        "The report or entry changed. Reload and review before resolving.",
      );
    await client.query(
      "UPDATE moderation_reports SET status=$2,resolution=$3,resolved_at=now(),version=version+1 WHERE id=$1",
      [id, data.outcome, data.resolution],
    );
    await client.query(
      `INSERT INTO moderation_report_audit(report_id,version,actor_id,listing_version,outcome,resolution)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        id,
        data.version + 1,
        req.account!.id,
        data.listingVersion,
        data.outcome,
        data.resolution,
      ],
    );
  });
  res.json({ ok: true });
});

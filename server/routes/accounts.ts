import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import {
  HttpError,
  requireUser,
  requireAdmin,
  transaction,
  audit,
  requireCurrentSession,
} from "../security.js";
import { usernameSchema } from "../../shared/auth.js";
import { staffAuthMode } from "../features.js";
export const accountRoutes = Router();
accountRoutes.use(requireUser, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
accountRoutes.get("/saved", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT listing_id FROM bookmarks WHERE account_id=$1 ORDER BY listing_id",
    [req.account!.id],
  );
  res.json({ ids: rows.map((row) => row.listing_id) });
});
accountRoutes.put("/saved/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    const count = await client.query(
      "SELECT count(*)::int AS n FROM bookmarks WHERE account_id=$1",
      [req.account!.id],
    );
    if (count.rows[0].n >= 1000)
      throw new HttpError(400, "You can save up to 1,000 entries.");
    await client.query(
      "INSERT INTO bookmarks SELECT $1,id FROM listings WHERE id=$2 AND status='published' ON CONFLICT DO NOTHING",
      [req.account!.id, id],
    );
  });
  res.json({ ok: true });
});
accountRoutes.delete("/saved/:id", async (req, res) => {
  await pool.query(
    "DELETE FROM bookmarks WHERE account_id=$1 AND listing_id=$2",
    [req.account!.id, z.uuid().parse(req.params.id)],
  );
  res.json({ ok: true });
});
accountRoutes.delete("/saved", async (req, res) => {
  await pool.query("DELETE FROM bookmarks WHERE account_id=$1", [
    req.account!.id,
  ]);
  res.json({ ok: true });
});
export const administration = Router();
administration.use(requireAdmin, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
// Administrator-only operational view. No email, credentials, bookmarks or
// public profile data. Search is parameterized and pagination is bounded.
administration.get("/users", async (req, res) => {
  const { q, page } = z
    .object({
      q: z.string().trim().max(80).default(""),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(req.query);
  const filter = q.normalize("NFKC").toLowerCase();
  const [count, result] = await Promise.all([
    pool.query(
      "SELECT count(*)::int AS total FROM accounts WHERE strpos(username,$1)>0 OR $1=''",
      [filter],
    ),
    pool.query(
      `SELECT a.id,a.username,a.role,a.privileges_suspended AS "privilegesSuspended",a.recovery_saved AS "recoverySaved",
      EXISTS(SELECT 1 FROM account_setup s WHERE s.account_id=a.id) AS "setupPending"
      FROM accounts a WHERE strpos(a.username,$1)>0 OR $1='' ORDER BY a.username,a.id LIMIT 24 OFFSET $2`,
      [filter, (page - 1) * 24],
    ),
  ]);
  res.json({
    items: result.rows,
    total: count.rows[0].total,
    page,
    pageSize: 24,
  });
});
// Exact username lookup: no user directory or bookmarks exposed to editors.
administration.get("/account", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,username,role,privileges_suspended AS "privilegesSuspended",(SELECT count(*)::int FROM passkeys WHERE account_id=accounts.id) AS "passkeyCount" FROM accounts WHERE username=$1`,
    [usernameSchema.parse(req.query.username)],
  );
  if (!rows[0]) throw new HttpError(404, "Account not found.");
  res.json(rows[0]);
});
administration.put("/role", async (req, res) => {
  const data = z
    .object({ username: usernameSchema, role: z.enum(["user", "editor"]) })
    .parse(req.body);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    const { rows } = await client.query(
      "SELECT * FROM accounts WHERE username=$1 FOR UPDATE",
      [data.username],
    );
    const user = rows[0];
    if (!user) throw new HttpError(404, "Account not found.");
    if (user.role === "administrator")
      throw new HttpError(
        400,
        "Administrator roles are managed through the host console.",
      );
    if (data.role === "editor") {
      const keys = await client.query(
        "SELECT 1 FROM passkeys WHERE account_id=$1",
        [user.id],
      );
      if (
        (staffAuthMode() === "passkey" && !keys.rowCount) ||
        !user.recovery_saved
      )
        throw new HttpError(
          400,
          staffAuthMode() === "passkey"
            ? "The user must save their recovery phrase and register a passkey first."
            : "The user must save their recovery phrase first.",
        );
    }
    await client.query(
      "UPDATE accounts SET role=$2,privileges_suspended=false,session_version=session_version+1 WHERE id=$1",
      [user.id, data.role],
    );
    await client.query("DELETE FROM sessions WHERE sess->>'accountId'=$1", [
      user.id,
    ]);
    await audit(client, req.account!.id, user.id, "role.assigned." + data.role);
  });
  res.json({ ok: true });
});
administration.get("/audit", async (req, res) => {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1)
    .parse(req.query.page);
  const { rows } = await pool.query(
    `SELECT id::text,actor_id AS "actorId",subject_id AS "subjectId",action,created_at AS "createdAt" FROM security_audit ORDER BY id DESC LIMIT 50 OFFSET $1`,
    [(page - 1) * 50],
  );
  res.json({ items: rows, page });
});

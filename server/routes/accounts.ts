import { Router } from "express";
import { randomUUID } from "node:crypto";
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
import {
  insertServiceAccount,
  runtimeEnvironment,
  serviceScopes,
  validServiceName,
} from "../service-accounts.js";
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
accountRoutes.get("/saved-tags", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.tag_id AS id
     FROM account_saved_tags s
     JOIN tag_definitions t ON t.id=s.tag_id
     WHERE s.account_id=$1 AND NOT t.retired AND t.merged_into IS NULL
     ORDER BY s.created_at,s.tag_id`,
    [req.account!.id],
  );
  res.json({ ids: rows.map((row) => row.id) });
});
accountRoutes.put("/saved-tags/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    const available = await client.query(
      "SELECT 1 FROM tag_definitions WHERE id=$1 AND NOT retired AND merged_into IS NULL",
      [id],
    );
    if (!available.rowCount)
      throw new HttpError(404, "That tag is no longer available.");
    const existing = await client.query(
      "SELECT 1 FROM account_saved_tags WHERE account_id=$1 AND tag_id=$2",
      [req.account!.id, id],
    );
    if (existing.rowCount) return;
    const count = await client.query(
      "SELECT count(*)::int AS n FROM account_saved_tags WHERE account_id=$1",
      [req.account!.id],
    );
    if (count.rows[0].n >= 100)
      throw new HttpError(400, "You can save up to 100 tags.");
    await client.query(
      `INSERT INTO account_saved_tags(account_id,tag_id)
       SELECT $1,id FROM tag_definitions
       WHERE id=$2 AND NOT retired AND merged_into IS NULL
       ON CONFLICT DO NOTHING`,
      [req.account!.id, id],
    );
  });
  res.json({ ok: true });
});
accountRoutes.delete("/saved-tags/:id", async (req, res) => {
  await pool.query(
    "DELETE FROM account_saved_tags WHERE account_id=$1 AND tag_id=$2",
    [req.account!.id, z.uuid().parse(req.params.id)],
  );
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
    `SELECT id,username,alias,role,privileges_suspended AS "privilegesSuspended",(SELECT count(*)::int FROM passkeys WHERE account_id=accounts.id) AS "passkeyCount" FROM accounts WHERE username=$1`,
    [usernameSchema.parse(req.query.username)],
  );
  if (!rows[0]) throw new HttpError(404, "Account not found.");
  res.json(rows[0]);
});
administration.put("/users/:id", async (req, res) => {
  const accountId = z.uuid().parse(req.params.id);
  const data = z
    .object({
      username: usernameSchema,
      alias: z
        .string()
        .trim()
        .max(80)
        .transform((value) => value || "Anonymous"),
      role: z.enum(["user", "editor", "administrator"]),
    })
    .parse(req.body);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    const { rows } = await client.query(
      "SELECT id,username,alias,role,recovery_saved FROM accounts WHERE id=$1 FOR UPDATE",
      [accountId],
    );
    const user = rows[0];
    if (!user) throw new HttpError(404, "Account not found.");
    if (user.id === req.account!.id)
      throw new HttpError(400, "Edit your own account from Account security.");
    if (user.role === "administrator" || data.role === "administrator")
      throw new HttpError(
        400,
        "Administrator accounts are managed through the host console.",
      );
    const duplicate = await client.query(
      "SELECT 1 FROM accounts WHERE username=$1 AND id<>$2",
      [data.username, accountId],
    );
    if (duplicate.rowCount)
      throw new HttpError(409, "That username is already in use.");
    if (data.role === "editor" && user.role !== "editor") {
      const keys = await client.query(
        "SELECT 1 FROM passkeys WHERE account_id=$1",
        [accountId],
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
    const changed =
      user.username !== data.username ||
      user.alias !== data.alias ||
      user.role !== data.role;
    if (!changed) return;
    await client.query(
      `UPDATE accounts SET username=$2,alias=$3,role=$4,
       privileges_suspended=CASE WHEN role<>$4 THEN false ELSE privileges_suspended END,
       session_version=session_version+1 WHERE id=$1`,
      [accountId, data.username, data.alias, data.role],
    );
    await client.query("DELETE FROM sessions WHERE sess->>'accountId'=$1", [
      accountId,
    ]);
    await audit(client, req.account!.id, accountId, "account.updated");
    if (user.role !== data.role)
      await audit(
        client,
        req.account!.id,
        accountId,
        "role.assigned." + data.role,
      );
  });
  res.json({ ok: true });
});
administration.delete("/users/:id", async (req, res) => {
  const accountId = z.uuid().parse(req.params.id);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    const { rows } = await client.query(
      "SELECT id,username,role FROM accounts WHERE id=$1 FOR UPDATE",
      [accountId],
    );
    const user = rows[0];
    if (!user) throw new HttpError(404, "Account not found.");
    if (user.id === req.account!.id)
      throw new HttpError(400, "You cannot delete your own account here.");
    if (user.role === "administrator")
      throw new HttpError(
        400,
        "Administrator accounts are managed through the host console.",
      );
    const references = await client.query(
      `SELECT
        (SELECT count(*)::int FROM listings WHERE owner_id=$1) AS listings,
        (SELECT count(*)::int FROM ownership_transfers
          WHERE proposer_id=$1 OR recipient_id=$1 OR prior_owner_id=$1) AS transfers,
        (SELECT count(*)::int FROM moderation_report_audit WHERE actor_id=$1) AS reports`,
      [accountId],
    );
    const reference = references.rows[0];
    if (reference.listings || reference.transfers || reference.reports)
      throw new HttpError(
        409,
        "This account has ownership or moderation records. Reassign or resolve those records before deleting it.",
      );
    await audit(client, req.account!.id, accountId, "account.deleted");
    await client.query("DELETE FROM sessions WHERE sess->>'accountId'=$1", [
      accountId,
    ]);
    await client.query("DELETE FROM accounts WHERE id=$1", [accountId]);
  });
  res.json({ ok: true });
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
administration.get("/service-accounts", async (_req, res) => {
  const environment = runtimeEnvironment();
  const { rows } = await pool.query(
    `SELECT id,name,environment,scopes,token_prefix AS "tokenPrefix",
      expires_at AS "expiresAt",revoked_at AS "revokedAt",created_at AS "createdAt",
      last_used_at AS "lastUsedAt"
     FROM service_accounts WHERE environment=$1 ORDER BY created_at DESC,id DESC`,
    [environment],
  );
  res.json({ environment, items: rows });
});
administration.post("/service-accounts", async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(3).max(80),
      expiresInDays: z.number().int().min(1).max(365).default(90),
      reason: z.string().trim().min(3).max(500),
      context: z
        .object({
          purpose: z.string().trim().max(500).optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .parse(req.body);
  const name = validServiceName(data.name);
  const environment = runtimeEnvironment();
  const requestId = randomUUID();
  res.set("X-Request-ID", requestId);
  let issued: Awaited<ReturnType<typeof insertServiceAccount>>;
  try {
    issued = await transaction(async (client) => {
      await requireCurrentSession(client, req);
      const existing = await client.query(
        "SELECT 1 FROM service_accounts WHERE name=$1 AND environment=$2",
        [name, environment],
      );
      if (existing.rowCount)
        throw new HttpError(
          409,
          "That service name already exists in this environment.",
        );
      const created = await insertServiceAccount(client, {
        name,
        environment,
        expiresInDays: data.expiresInDays,
      });
      await audit(
        client,
        req.account!.id,
        created.serviceAccount.id,
        "service-account.created",
        {
          actorType: "account",
          subjectType: "service_account",
          requestId,
          reason: data.reason,
          details: {
            name,
            environment,
            scopes: serviceScopes,
            expiresAt: created.serviceAccount.expiresAt,
            ...(data.context ? { context: data.context } : {}),
          },
        },
      );
      return created;
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      throw new HttpError(
        409,
        "That service name already exists in this environment.",
      );
    throw error;
  }
  res
    .status(201)
    .json({ token: issued.token, serviceAccount: issued.serviceAccount });
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
    `SELECT s.id::text,s.actor_id AS "actorId",s.actor_type AS "actorType",s.subject_id AS "subjectId",s.subject_type AS "subjectType",s.action,s.request_id AS "requestId",s.reason,s.details,s.outcome,s.created_at AS "createdAt",
      COALESCE(a.username,sa.name) AS "actorName"
     FROM security_audit s
     LEFT JOIN accounts a ON s.actor_type='account' AND a.id=s.actor_id
     LEFT JOIN service_accounts sa ON s.actor_type='service_account' AND sa.id=s.actor_id
     ORDER BY s.id DESC LIMIT 50 OFFSET $1`,
    [(page - 1) * 50],
  );
  res.json({ items: rows, page });
});
administration.get("/audit/listings", async (req, res) => {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1)
    .parse(req.query.page);
  const { rows } = await pool.query(
    `SELECT r.listing_id AS "listingId",l.name,r.version,r.action,r.reason,r.details,
      r.actor_id AS "actorId",r.actor_type AS "actorType",r.request_id AS "requestId",
      (r.before_data-'owner_id') AS before,(r.after_data-'owner_id') AS after,
      (to_jsonb(l)-'search_vector'-'owner_id') AS current,
      r.created_at AS "createdAt",
      l.version AS "currentVersion",COALESCE(a.username,sa.name) AS "actorName"
     FROM listing_revisions r
     JOIN listings l ON l.id=r.listing_id
     LEFT JOIN accounts a ON r.actor_type='account' AND a.id=r.actor_id
     LEFT JOIN service_accounts sa ON r.actor_type='service_account' AND sa.id=r.actor_id
     ORDER BY r.created_at DESC,r.listing_id,r.version DESC
     LIMIT 25 OFFSET $1`,
    [(page - 1) * 25],
  );
  res.json({ items: rows, page, pageSize: 25 });
});

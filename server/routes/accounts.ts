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
  defaultServiceScopes,
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
administration.get("/service-accounts", async (req, res) => {
  const { includeDeleted } = z
    .object({ includeDeleted: z.enum(["true", "false"]).default("false") })
    .parse(req.query);
  const environment = runtimeEnvironment();
  const { rows } = await pool.query(
    `SELECT id,name,environment,scopes,token_prefix AS "tokenPrefix",
      expires_at AS "expiresAt",revoked_at AS "revokedAt",created_at AS "createdAt",
      last_used_at AS "lastUsedAt",deleted_at AS "deletedAt"
     FROM service_accounts
     WHERE environment=$1 AND ($2::boolean OR deleted_at IS NULL)
     ORDER BY deleted_at NULLS FIRST,created_at DESC,id DESC`,
    [environment, includeDeleted === "true"],
  );
  res.json({ environment, items: rows });
});
administration.post("/service-accounts", async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(3).max(80),
      expiresInDays: z.number().int().min(1).max(365).default(90),
      scopes: z
        .array(z.enum(serviceScopes))
        .min(1)
        .default(defaultServiceScopes),
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
  const requestId = (req.requestId ??= randomUUID());
  res.set("X-Request-ID", requestId);
  let issued: Awaited<ReturnType<typeof insertServiceAccount>>;
  try {
    issued = await transaction(async (client) => {
      await requireCurrentSession(client, req);
      const existing = await client.query(
        "SELECT 1 FROM service_accounts WHERE name=$1 AND environment=$2 AND deleted_at IS NULL",
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
        scopes: data.scopes,
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
            scopes: data.scopes,
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
administration.delete("/service-accounts/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { reason } = z
    .object({ reason: z.string().trim().min(3).max(500) })
    .strict()
    .parse(req.body);
  const requestId = (req.requestId ??= randomUUID());
  res.set("X-Request-ID", requestId);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    const { rows } = await client.query(
      `SELECT id,name,environment,scopes,revoked_at AS "revokedAt",deleted_at AS "deletedAt"
       FROM service_accounts WHERE id=$1 AND environment=$2 FOR UPDATE`,
      [id, runtimeEnvironment()],
    );
    const service = rows[0];
    if (!service) throw new HttpError(404, "Service account not found.");
    if (service.deletedAt)
      throw new HttpError(409, "This service account was already deleted.");
    const { rows: deleted } = await client.query(
      `UPDATE service_accounts
       SET revoked_at=COALESCE(revoked_at,now()),deleted_at=now()
       WHERE id=$1 RETURNING deleted_at AS "deletedAt"`,
      [id],
    );
    await audit(client, req.account!.id, id, "service-account.deleted", {
      actorType: "account",
      subjectType: "service_account",
      requestId,
      reason,
      details: {
        name: service.name,
        environment: service.environment,
        scopes: service.scopes,
        wasAlreadyRevoked: Boolean(service.revokedAt),
        deletedAt: deleted[0].deletedAt,
      },
    });
  });
  res.json({ ok: true });
});
administration.get("/audit/activity", async (req, res) => {
  const filters = z
    .object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      period: z.enum(["24h", "7d", "30d", "all"]).default("7d"),
      category: z
        .enum([
          "all",
          "listing",
          "event",
          "image",
          "account",
          "service",
          "auth",
          "security",
          "system",
        ])
        .default("all"),
      actor: z
        .enum(["all", "account", "service_account", "system"])
        .default("all"),
      search: z.string().trim().max(120).default(""),
    })
    .parse(req.query);
  const periodMs = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  } as const;
  const since =
    filters.period === "all"
      ? null
      : new Date(Date.now() - periodMs[filters.period]).toISOString();
  const search = filters.search || null;
  const pageSize = 30;
  const { rows } = await pool.query(
    `WITH activity AS (
       SELECT
         'listing:' || r.listing_id::text || ':' || r.version::text AS id,
         'listing'::text AS category,
         CASE WHEN r.before_data IS NULL THEN 'listing.created' ELSE r.action END AS action,
         r.actor_type AS "actorType",r.actor_id AS "actorId",
         COALESCE(a.username,sa.name,CASE WHEN r.actor_type='system' THEN 'System' END) AS "actorName",
         'listing'::text AS "subjectType",r.listing_id AS "subjectId",
         COALESCE(l.name,r.after_data->>'name',r.before_data->>'name','Deleted entry') AS "subjectName",
         r.request_id AS "requestId",r.reason,r.details,'success'::text AS outcome,
         r.created_at AS "createdAt",r.version,
         r.before_data-'owner_id' AS before,
         r.after_data-'owner_id' AS after,
         CASE WHEN l.id IS NULL THEN NULL ELSE to_jsonb(l)-'search_vector'-'owner_id' END AS current,
         l.version AS "currentVersion",l.status AS "listingStatus",
         l.editor_reviewed_at AS "editorReviewedAt",
         (r.action='baseline') AS baseline
       FROM listing_revisions r
       LEFT JOIN listings l ON l.id=r.listing_id
       LEFT JOIN accounts a ON r.actor_type='account' AND a.id=r.actor_id
       LEFT JOIN service_accounts sa ON r.actor_type='service_account' AND sa.id=r.actor_id
       WHERE ($1::timestamptz IS NULL OR r.created_at >= $1)
         AND r.action <> 'baseline'
       UNION ALL
       SELECT
         'event:' || er.event_id::text || ':' || er.version::text AS id,
         'event'::text AS category,
         CASE WHEN er.before_data IS NULL THEN 'event.imported' ELSE 'event.updated' END AS action,
         'system'::text AS "actorType",NULL::uuid AS "actorId",
         'FSP sync'::text AS "actorName",
         'event'::text AS "subjectType",er.event_id AS "subjectId",
         COALESCE(e.title,er.after_data->>'title','Removed event') AS "subjectName",
         NULL::text AS "requestId",
         'Updated from the public FSP calendar.'::text AS reason,
         jsonb_build_object('sourceKey',er.source_key) AS details,
         'success'::text AS outcome,er.created_at AS "createdAt",er.version,
         er.before_data AS before,er.after_data AS after,
         CASE WHEN e.id IS NULL THEN NULL ELSE to_jsonb(e) END AS current,
         e.version AS "currentVersion",NULL::text AS "listingStatus",
         NULL::timestamptz AS "editorReviewedAt",false AS baseline
       FROM event_revisions er
       LEFT JOIN events e ON e.id=er.event_id
       WHERE er.created_at >= (
           SELECT installed_at FROM admin_activity_feed_meta WHERE id=1
         )
         AND ($1::timestamptz IS NULL OR er.created_at >= $1)
       UNION ALL
       SELECT
         'security:' || s.id::text AS id,
         CASE
           WHEN s.action LIKE 'listing.image.%' THEN 'image'
           WHEN s.action LIKE 'listing.%' THEN 'listing'
           WHEN s.action LIKE 'service-account.%' OR s.subject_type='service_account' THEN 'service'
           WHEN s.action LIKE 'account.%' OR s.action LIKE 'role.%' THEN 'account'
           WHEN s.action LIKE 'auth.%' THEN 'auth'
           WHEN s.actor_type='system' THEN 'system'
           ELSE 'security'
         END AS category,
         s.action,s.actor_type AS "actorType",s.actor_id AS "actorId",
         COALESCE(a.username,sa.name,CASE WHEN s.actor_type='system' THEN 'System' END) AS "actorName",
         s.subject_type AS "subjectType",s.subject_id AS "subjectId",
         COALESCE(l.name,lr.after_data->>'name',lr.before_data->>'name',
           subject_account.username,subject_service.name) AS "subjectName",
         s.request_id AS "requestId",s.reason,s.details,s.outcome,
         s.created_at AS "createdAt",NULL::integer AS version,
         NULL::jsonb AS before,NULL::jsonb AS after,
         NULL::jsonb AS current,NULL::integer AS "currentVersion",
         l.status AS "listingStatus",l.editor_reviewed_at AS "editorReviewedAt",
         false AS baseline
       FROM security_audit s
       LEFT JOIN accounts a ON s.actor_type='account' AND a.id=s.actor_id
       LEFT JOIN service_accounts sa ON s.actor_type='service_account' AND sa.id=s.actor_id
       LEFT JOIN listings l ON s.subject_type='listing' AND l.id=s.subject_id
       LEFT JOIN LATERAL (
         SELECT r.after_data,r.before_data FROM listing_revisions r
         WHERE s.subject_type='listing' AND r.listing_id=s.subject_id
         ORDER BY r.version DESC LIMIT 1
       ) lr ON true
       LEFT JOIN accounts subject_account ON s.subject_type='account' AND subject_account.id=s.subject_id
       LEFT JOIN service_accounts subject_service ON s.subject_type='service_account' AND subject_service.id=s.subject_id
       WHERE ($1::timestamptz IS NULL OR s.created_at >= $1)
         AND NOT (
           s.subject_type='listing'
           AND s.action IN ('listing.created','listing.updated','listing.restored')
           AND s.request_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM listing_revisions r
             WHERE r.listing_id=s.subject_id AND r.request_id=s.request_id
           )
         )
     ), filtered AS (
       SELECT * FROM activity
       WHERE ($2='all' OR category=$2)
         AND ($3='all' OR "actorType"=$3)
         AND ($4::text IS NULL OR position(lower($4) in lower(
           concat_ws(' ',action,reason,"subjectName","actorName",details::text)
         )) > 0)
     )
     SELECT to_jsonb(filtered) AS item,count(*) OVER()::int AS total
     FROM filtered
     ORDER BY "createdAt" DESC,id DESC
     LIMIT $5 OFFSET $6`,
    [
      since,
      filters.category,
      filters.actor,
      search,
      pageSize,
      (filters.page - 1) * pageSize,
    ],
  );
  const total = rows[0]?.total ?? 0;
  res.json({
    items: rows.map((row) => row.item),
    page: filters.page,
    pageSize,
    total,
    hasMore: filters.page * pageSize < total,
  });
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
    `SELECT r.listing_id AS "listingId",
      COALESCE(l.name,r.after_data->>'name',r.before_data->>'name','Deleted entry') AS name,
      r.version,r.action,r.reason,r.details,
      r.actor_id AS "actorId",r.actor_type AS "actorType",r.request_id AS "requestId",
      (r.before_data-'owner_id') AS before,(r.after_data-'owner_id') AS after,
      CASE WHEN l.id IS NULL THEN NULL ELSE (to_jsonb(l)-'search_vector'-'owner_id') END AS current,
      r.created_at AS "createdAt",
      l.version AS "currentVersion",COALESCE(a.username,sa.name) AS "actorName"
     FROM listing_revisions r
     LEFT JOIN listings l ON l.id=r.listing_id
     LEFT JOIN accounts a ON r.actor_type='account' AND a.id=r.actor_id
     LEFT JOIN service_accounts sa ON r.actor_type='service_account' AND sa.id=r.actor_id
     ORDER BY r.created_at DESC,r.listing_id,r.version DESC
     LIMIT 25 OFFSET $1`,
    [(page - 1) * 25],
  );
  res.json({ items: rows, page, pageSize: 25 });
});

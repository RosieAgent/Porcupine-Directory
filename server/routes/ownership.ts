import { Router } from "express";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  nominationSchema,
  externalOwnerSchema,
} from "../../shared/ownership.js";
import { staffAuthMode } from "../features.js";
import {
  HttpError,
  assertStaff,
  audit,
  recentlyVerified,
  requireStaff,
  requireUser,
  transaction,
} from "../security.js";

// Mount below the application's /api session, origin and CSRF middleware.
export const ownership = Router();
ownership.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
}, requireUser);

type LockedAccount = {
  id: string;
  role: string;
  privileges_suspended: boolean;
  recovery_saved: boolean;
  session_version: number;
};
type Transfer = {
  id: string;
  listing_id: string;
  proposer_id: string;
  proposer_role: string;
  proposer_session_version: number;
  recipient_id: string;
  prior_owner_id: string | null;
  listing_version: number;
  listing_status: string;
  state: string;
};

// Account locks precede entry/offer locks, matching existing listing writes.
// SHARE prevents role/recovery/session revocation racing an authorization check.
async function lockAccounts(client: PoolClient, req: Request, ids: string[]) {
  const { rows } = await client.query<LockedAccount>(
    `SELECT id,role,privileges_suspended,recovery_saved,session_version
     FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`,
    [[...new Set([req.account!.id, ...ids])]],
  );
  const current = rows.find((row) => row.id === req.account!.id);
  if (!current || current.session_version !== req.session.version)
    throw new HttpError(401, "Please sign in again.");
  return rows;
}
function currentStaff(req: Request, accounts: LockedAccount[]) {
  const current = accounts.find((row) => row.id === req.account!.id)!;
  if (
    current.role === "user" ||
    current.privileges_suspended ||
    !current.recovery_saved
  )
    throw new HttpError(403, "Current staff authorization is required.");
  assertStaff(req);
}
async function record(
  client: PoolClient,
  offer: Transfer,
  actor: string | null,
  action: string,
  cause = "",
) {
  await client.query(
    "INSERT INTO ownership_audit(transfer_id,actor_id,action,cause) VALUES ($1,$2,$3,$4)",
    [offer.id, actor, action, cause],
  );
  await audit(client, actor, offer.recipient_id, "ownership." + action);
}
async function resolve(
  client: PoolClient,
  offer: Transfer,
  actor: string | null,
  state: string,
  cause = "",
) {
  await client.query(
    "UPDATE ownership_transfers SET state=$2,resolved_at=clock_timestamp() WHERE id=$1",
    [offer.id, state],
  );
  await record(client, offer, actor, state, cause);
}
const offerColumns = `t.id,t.listing_id AS "listingId",l.name AS "listingName",
  t.listing_version AS "listingVersion",t.listing_status AS "listingStatus",
  CASE WHEN t.state='pending' AND t.expires_at<=clock_timestamp() THEN 'expired' ELSE t.state END AS state,
  t.created_at AS "createdAt",t.expires_at AS "expiresAt"`;

ownership.get("/inbox", async (req, res) => {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1)
    .parse(req.query.page);
  const result = await transaction(async (client) => {
    await lockAccounts(client, req, []);
    const count = await client.query(
      "SELECT count(*)::int AS total FROM ownership_transfers WHERE recipient_id=$1",
      [req.account!.id],
    );
    const { rows } = await client.query(
      `SELECT ${offerColumns} FROM ownership_transfers t JOIN listings l ON l.id=t.listing_id
       WHERE t.recipient_id=$1 ORDER BY t.created_at DESC,t.id LIMIT 24 OFFSET $2`,
      [req.account!.id, (page - 1) * 24],
    );
    return { items: rows, total: count.rows[0].total, page, pageSize: 24 };
  });
  res.json(result);
});

// Only staff can discover account usernames; bounded, private and never cached.
ownership.get("/candidates", requireStaff, async (req, res) => {
  const query = z
    .object({
      q: z.string().trim().max(80).default(""),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(req.query);
  const result = await transaction(async (client) => {
    currentStaff(req, await lockAccounts(client, req, []));
    const filter =
      "strpos(lower(username),lower($1))>0 OR strpos(lower(alias),lower($1))>0";
    const count = await client.query(
      `SELECT count(*)::int AS total FROM accounts WHERE ${filter}`,
      [query.q],
    );
    const { rows } = await client.query(
      `SELECT id,username,alias FROM accounts WHERE ${filter} ORDER BY username,id LIMIT 24 OFFSET $2`,
      [query.q, (query.page - 1) * 24],
    );
    return {
      items: rows,
      total: count.rows[0].total,
      page: query.page,
      pageSize: 24,
    };
  });
  res.json(result);
});

ownership.get("/listings/:id", requireStaff, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const result = await transaction(async (client) => {
    currentStaff(req, await lockAccounts(client, req, []));
    const { rows } = await client.query(
      `SELECT l.version,l.external_owner_label AS "externalOwnerLabel",a.username AS "ownerUsername" FROM listings l
       LEFT JOIN accounts a ON a.id=l.owner_id WHERE l.id=$1 FOR SHARE OF l`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, "Entry not found.");
    const offers = await client.query(
      `SELECT ${offerColumns},a.username AS "recipientUsername" FROM ownership_transfers t
       JOIN listings l ON l.id=t.listing_id JOIN accounts a ON a.id=t.recipient_id
       WHERE t.listing_id=$1 AND t.state='pending' AND t.expires_at>clock_timestamp()`,
      [id],
    );
    return { ...rows[0], pending: offers.rows[0] ?? null };
  });
  res.json(result);
});

ownership.post("/listings/:id/no-account", requireStaff, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const data = externalOwnerSchema.parse(req.body);
  await transaction(async (client) => {
    currentStaff(req, await lockAccounts(client, req, []));
    const { rows } = await client.query(
      "SELECT version FROM listings WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!rows[0]) throw new HttpError(404, "Entry not found.");
    if (rows[0].version !== data.version)
      throw new HttpError(
        409,
        "Entry changed. Reload before assigning ownership.",
      );
    const pending = await client.query(
      "SELECT id FROM ownership_transfers WHERE listing_id=$1 AND state='pending' AND expires_at>clock_timestamp()",
      [id],
    );
    if (pending.rowCount)
      throw new HttpError(
        409,
        "Cancel the pending assignment before changing ownership.",
      );
    await client.query(
      "SELECT set_config('app.actor',$1,true),set_config('app.action','ownership.no-account',true),set_config('app.reason',$2,true)",
      [req.account!.id, data.reason],
    );
    await client.query(
      `UPDATE listings SET owner_id=NULL,external_owner_label=$2,locally_edited=true,
      self_confirmed_at=NULL,editor_reviewed_at=NULL,last_confirmed_at=NULL WHERE id=$1`,
      [id, data.label || null],
    );
    await audit(client, req.account!.id, id, "ownership.no-account");
  });
  res.json({ ok: true });
});

ownership.post("/listings/:id", requireStaff, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const data = nominationSchema.parse(req.body);
  const result = await transaction(async (client) => {
    // The offer's prior_owner_id FK also takes an account lock. Acquire it before
    // the listing so an owner edit holding requireCurrentSession's UPDATE lock
    // cannot deadlock with the subsequent offer INSERT.
    const initial = await client.query<{ owner_id: string | null }>(
      "SELECT owner_id FROM listings WHERE id=$1",
      [id],
    );
    const priorOwner = initial.rows[0]?.owner_id;
    const recipient = await client.query(
      "SELECT id FROM accounts WHERE username=$1",
      [data.username],
    );
    const recipientId: string | undefined = recipient.rows[0]?.id;
    const accounts = await lockAccounts(client, req, [
      ...(recipientId ? [recipientId] : []),
      ...(priorOwner ? [priorOwner] : []),
    ]);
    currentStaff(req, accounts);
    if (!recipientId || !accounts.some((a) => a.id === recipientId))
      throw new HttpError(
        404,
        "Account not found. Use the exact private username.",
      );
    const { rows } = await client.query(
      "SELECT id,owner_id,version,status FROM listings WHERE id=$1 FOR UPDATE",
      [id],
    );
    const entry = rows[0];
    if (!entry) throw new HttpError(404, "Entry not found.");
    if (entry.version !== data.version || entry.owner_id !== priorOwner)
      throw new HttpError(
        409,
        "Entry changed. Reload before proposing ownership.",
      );
    if (entry.owner_id === recipientId)
      throw new HttpError(409, "That account already owns this entry.");
    const pending = await client.query<Transfer & { expired: boolean }>(
      "SELECT *,expires_at<=clock_timestamp() AS expired FROM ownership_transfers WHERE listing_id=$1 AND state='pending' FOR UPDATE",
      [id],
    );
    if (pending.rows[0]) {
      if (!pending.rows[0].expired)
        throw new HttpError(
          409,
          "Cancel the pending assignment before proposing another.",
        );
      await resolve(client, pending.rows[0], null, "expired", "expired");
    }
    const proposer = accounts.find((a) => a.id === req.account!.id)!;
    const inserted = await client.query<Transfer>(
      `INSERT INTO ownership_transfers(listing_id,proposer_id,proposer_role,proposer_session_version,
       recipient_id,prior_owner_id,listing_version,listing_status,reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        id,
        proposer.id,
        proposer.role,
        proposer.session_version,
        recipientId,
        entry.owner_id,
        entry.version,
        entry.status,
        data.reason,
      ],
    );
    await record(client, inserted.rows[0], req.account!.id, "proposed");
    return { id: inserted.rows[0].id };
  });
  res.status(201).json(result);
});

for (const action of ["accept", "decline", "cancel"] as const) {
  ownership.post(`/:id/${action}`, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    if (action === "cancel") assertStaff(req);
    const result = await transaction(async (client) => {
      // Immutable identity lookup; re-read mutable state under the entry/offer locks.
      const initial = await client.query<Transfer>(
        "SELECT * FROM ownership_transfers WHERE id=$1",
        [id],
      );
      const identity = initial.rows[0];
      if (
        !identity ||
        (action !== "cancel" && identity.recipient_id !== req.account!.id)
      )
        throw new HttpError(404, "Assignment not found.");
      const accounts = await lockAccounts(client, req, [identity.proposer_id]);
      if (action === "cancel") currentStaff(req, accounts);
      const listing = await client.query(
        "SELECT owner_id,version,status FROM listings WHERE id=$1 FOR UPDATE",
        [identity.listing_id],
      );
      const { rows } = await client.query<Transfer & { expired: boolean }>(
        "SELECT *,expires_at<=clock_timestamp() AS expired FROM ownership_transfers WHERE id=$1 FOR UPDATE",
        [id],
      );
      const offer = rows[0];
      if (offer.state !== "pending")
        return "This assignment is already resolved.";
      // Return failures after committing terminal states and their audit records.
      if (offer.expired) {
        await resolve(client, offer, null, "expired", "expired");
        return "This assignment has expired.";
      }
      if (action === "accept") {
        const proposer = accounts.find((a) => a.id === offer.proposer_id);
        if (
          !proposer ||
          proposer.role !== offer.proposer_role ||
          proposer.role === "user" ||
          proposer.privileges_suspended ||
          !proposer.recovery_saved ||
          proposer.session_version !== offer.proposer_session_version
        ) {
          await resolve(client, offer, null, "revoked", "proposer_changed");
          return "Staff authorization changed. A new assignment is required.";
        }
        const entry = listing.rows[0];
        if (
          !entry ||
          entry.owner_id !== offer.prior_owner_id ||
          entry.version !== offer.listing_version ||
          entry.status !== offer.listing_status
        ) {
          await resolve(client, offer, null, "revoked", "entry_changed");
          return "The entry changed. Staff must propose a new assignment.";
        }
        // This is recipient consent, not a staff action: no recovery/passkey gate.
        // Proposer verification is required when nominating, not kept alive for seven days.
        if (
          staffAuthMode() !== "session" &&
          !recentlyVerified(req.session.passwordAuthenticatedAt)
        )
          throw new HttpError(
            403,
            "Verify your password before accepting (valid for 15 minutes).",
          );
        await client.query(
          "SELECT set_config('app.actor',$1,true),set_config('app.action','ownership.accepted',true),set_config('app.reason','Recipient accepted private maintenance ownership',true)",
          [req.account!.id],
        );
        await client.query(
          `UPDATE listings SET owner_id=$2,external_owner_label=NULL,locally_edited=true,self_confirmed_at=NULL,
           editor_reviewed_at=NULL,last_confirmed_at=NULL WHERE id=$1`,
          [offer.listing_id, req.account!.id],
        );
      }
      await resolve(
        client,
        offer,
        req.account!.id,
        action === "accept"
          ? "accepted"
          : action === "decline"
            ? "declined"
            : "cancelled",
      );
      return null;
    });
    if (result) throw new HttpError(409, result);
    res.json({ ok: true });
  });
}

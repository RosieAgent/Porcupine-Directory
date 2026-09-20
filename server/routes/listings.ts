import { Router } from "express";
import { z } from "zod";
import {
  listingQuerySchema,
  submissionSchema,
} from "../../shared/contracts.js";
import { pool } from "../db.js";
import { canonicalTags, syncPlatformTags } from "../tags.js";
import { legacyConnections } from "../../shared/connections.js";
import type { Connection } from "../../shared/connections.js";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { CONFIRMATION_FRESH_DAYS } from "../../shared/trust.js";
import {
  findLocation,
  normalizeLocation,
  locationMatchKey,
} from "../../shared/locations.js";
import {
  HttpError,
  requireUser,
  requireStaff,
  assertStaff,
  isEditor,
  submissionPolicy,
  transaction,
  limit,
  requireCurrentSession,
} from "../security.js";

function validateLocation(value: string, previous = "") {
  if (value && !findLocation(value) && value !== normalizeLocation(previous))
    throw new HttpError(
      400,
      "Select a New Hampshire town, region, county or statewide location from the list.",
    );
}

export const listings = Router();
const columns = `id, kind, name, summary, description, url, contact_url AS "contactUrl", location, tags,
  access_mode AS "accessMode", access_instructions AS "accessInstructions", source_name AS "sourceName",
  source_url AS "sourceUrl", last_confirmed_at AS "lastConfirmedAt", imported_at AS "importedAt", links,
  version,status,connections,self_confirmed_at AS "selfConfirmedAt",editor_reviewed_at AS "editorReviewedAt",
  lifecycle,seeking_organizer AS "seekingOrganizer",public_phone AS "publicPhone",public_email AS "publicEmail",public_address AS "publicAddress",opening_hours AS "openingHours",reference_sources AS "referenceSources",
  NOT listing_has_joining_details(connections,access_instructions,public_phone,public_email) AS "missingJoiningDetails"`;

listings.get("/manage", requireUser, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1)
    .parse(req.query.page);
  const all = req.query.all === "true";
  if (all) assertStaff(req);
  const filter = all ? "TRUE" : "owner_id=$1";
  const params = all ? [] : [req.account!.id];
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM listings WHERE ${filter}`,
    params,
  );
  const { rows } = await pool.query(
    `SELECT ${columns} FROM listings WHERE ${filter} ORDER BY updated_at DESC,id LIMIT 24 OFFSET $${params.length + 1}`,
    [...params, (page - 1) * 24],
  );
  res.json({ items: rows, total: count.rows[0].total, page, pageSize: 24 });
});

listings.get("/:id/permissions", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { rows } = await pool.query(
    "SELECT owner_id FROM listings WHERE id=$1",
    [z.uuid().parse(req.params.id)],
  );
  const owner = !!req.account && rows[0]?.owner_id === req.account.id;
  res.json({
    canEdit: owner || isEditor(req),
    canConfirm: owner,
    canReview: isEditor(req),
  });
});
listings.get("/:id/edit", requireUser, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { rows } = await pool.query(
    `SELECT ${columns},owner_id FROM listings WHERE id=$1`,
    [z.uuid().parse(req.params.id)],
  );
  if (!rows[0]) throw new HttpError(404, "Entry not found.");
  if (rows[0].owner_id !== req.account!.id) assertStaff(req);
  const entry = { ...rows[0] };
  delete entry.owner_id;
  res.json(entry);
});
listings.get("/:id/history", requireStaff, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1)
    .parse(req.query.page);
  const { rows } = await pool.query(
    `SELECT version,action,reason,actor_id AS "actorId",before_data AS before,after_data AS after,created_at AS "createdAt" FROM listing_revisions WHERE listing_id=$1 ORDER BY version DESC LIMIT 20 OFFSET $2`,
    [z.uuid().parse(req.params.id), (page - 1) * 20],
  );
  res.json({ items: rows, page });
});
async function context(
  client: PoolClient,
  req: Request,
  action: string,
  reason = "",
) {
  await client.query(
    "SELECT set_config('app.actor',$1,true),set_config('app.action',$2,true),set_config('app.reason',$3,true)",
    [req.account?.id ?? "", action, reason],
  );
}
async function lockedEntry(client: PoolClient, req: Request, version: number) {
  // Lock the account too: concurrent role revocation/recovery cannot authorize a stale edit.
  const account = await client.query(
    "SELECT session_version,role,privileges_suspended FROM accounts WHERE id=$1 FOR SHARE",
    [req.account!.id],
  );
  if (account.rows[0]?.session_version !== req.session.version)
    throw new HttpError(401, "Please sign in again.");
  const { rows } = await client.query(
    "SELECT * FROM listings WHERE id=$1 FOR UPDATE",
    [z.uuid().parse(req.params.id)],
  );
  const entry = rows[0];
  if (!entry) throw new HttpError(404, "Entry not found.");
  if (entry.owner_id !== req.account!.id) assertStaff(req);
  if (entry.version !== version)
    throw new HttpError(
      409,
      "This entry changed. Reload and review the latest version before saving.",
    );
  return entry;
}
const changeSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
const editSchema = changeSchema.extend({ entry: submissionSchema });
export async function updateContent(
  client: PoolClient,
  id: string,
  e: z.infer<typeof submissionSchema>,
  previous: {
    url: string | null;
    contact_url: string | null;
    links: { label: string; url: string }[];
    connections: Connection[];
  },
  references?: { label: string; url: string; checkedAt: string }[],
) {
  const connections =
    e.connections ??
    ((e.url || null) === previous.url &&
    (e.contactUrl || null) === previous.contact_url
      ? previous.connections
      : legacyConnections(
          {
            url: e.url,
            contact_url: e.contactUrl,
            links: previous.links.filter(
              (link) =>
                !(link.url === previous.url && e.url !== previous.url) &&
                !(
                  link.url === previous.contact_url &&
                  e.contactUrl !== previous.contact_url
                ),
            ),
          },
          previous.connections,
        ));
  e.tags = await syncPlatformTags(client, e.tags, connections);
  await client.query(
    `UPDATE listings SET kind=$2,name=$3,summary=$4,description=$5,
    url=$6,contact_url=$7,location=$8,tags=$9,access_mode=$10,access_instructions=$11,connections=$12,links=$13,lifecycle=$14,seeking_organizer=$15,public_phone=$16,public_email=$17,public_address=$18,opening_hours=$19,reference_sources=COALESCE($20::jsonb,reference_sources),locally_edited=true WHERE id=$1`,
    [
      id,
      e.kind,
      e.name,
      e.summary,
      e.description,
      e.connections ? (connections[0]?.url ?? null) : e.url || null,
      e.connections ? null : e.contactUrl || null,
      e.location || null,
      e.tags,
      e.accessMode,
      e.accessInstructions,
      JSON.stringify(connections),
      JSON.stringify(connections.map(({ label, url }) => ({ label, url }))),
      e.lifecycle,
      e.seekingOrganizer,
      e.publicPhone,
      e.publicEmail,
      e.publicAddress,
      e.openingHours,
      references ? JSON.stringify(references) : null,
    ],
  );
}
listings.put("/:id", requireUser, async (req, res) => {
  const data = editSchema.parse(req.body);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    const entry = await lockedEntry(client, req, data.version);
    data.entry.tags = await canonicalTags(client, data.entry.tags, entry.tags);
    data.entry.kind = entry.kind; // Legacy compatibility metadata, not an editable category.
    validateLocation(data.entry.location, entry.location ?? "");
    await context(client, req, "edit", data.reason);
    await updateContent(client, entry.id, data.entry, entry);
  });
  res.json({ ok: true });
});
listings.post("/:id/action", requireUser, async (req, res) => {
  const data = changeSchema
    .extend({ action: z.enum(["confirm", "review", "publish", "hide"]) })
    .parse(req.body);
  await transaction(async (client) => {
    const entry = await lockedEntry(client, req, data.version);
    if (data.action === "confirm") {
      if (entry.owner_id !== req.account!.id)
        throw new HttpError(
          403,
          "Only the account owner can self-confirm an entry.",
        );
    } else if (!(data.action === "hide" && entry.owner_id === req.account!.id))
      assertStaff(req);
    await context(client, req, data.action, data.reason);
    const updates = {
      confirm: "self_confirmed_at=now()",
      review: "editor_reviewed_at=now()",
      publish: "status='published'",
      hide: "status='archived'",
    };
    await client.query(
      `UPDATE listings SET ${updates[data.action]},locally_edited=true WHERE id=$1`,
      [entry.id],
    );
  });
  res.json({ ok: true });
});
listings.post("/:id/restore", requireStaff, async (req, res) => {
  const data = changeSchema
    .extend({ targetVersion: z.number().int().positive() })
    .parse(req.body);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    const entry = await lockedEntry(client, req, data.version);
    const { rows } = await client.query(
      "SELECT after_data FROM listing_revisions WHERE listing_id=$1 AND version=$2",
      [entry.id, data.targetVersion],
    );
    if (!rows[0]) throw new HttpError(404, "Revision not found.");
    const old = rows[0].after_data;
    const restored = submissionSchema.parse({
      ...old,
      url: old.url || "",
      location: old.location || "",
      contactUrl: old.contact_url || "",
      accessMode: old.access_mode,
      accessInstructions: old.access_instructions,
      connections: old.connections ?? legacyConnections(old),
      seekingOrganizer: old.seeking_organizer ?? false,
      publicPhone: old.public_phone ?? "",
      publicEmail: old.public_email ?? "",
      publicAddress: old.public_address ?? "",
      openingHours: old.opening_hours ?? "",
    });
    restored.tags = await canonicalTags(
      client,
      restored.tags,
      entry.tags,
      true,
    );
    restored.tags = await syncPlatformTags(
      client,
      restored.tags,
      restored.connections ?? [],
    );
    await context(
      client,
      req,
      "restore",
      `Revision ${data.targetVersion}: ${data.reason}`,
    );
    // One UPDATE = one atomic new revision. Ownership, visibility and trust badges are never restored.
    await client.query(
      `UPDATE listings SET kind=$2,name=$3,summary=$4,description=$5,url=$6,contact_url=$7,location=$8,tags=$9,access_mode=$10,access_instructions=$11,links=$12,connections=$13,lifecycle=$14,seeking_organizer=$15,public_phone=$16,public_email=$17,public_address=$18,opening_hours=$19,reference_sources='[]'::jsonb,locally_edited=true,self_confirmed_at=NULL,editor_reviewed_at=NULL,last_confirmed_at=NULL WHERE id=$1`,
      [
        entry.id,
        restored.kind,
        restored.name,
        restored.summary,
        restored.description,
        restored.url || null,
        restored.contactUrl || null,
        restored.location || null,
        restored.tags,
        restored.accessMode,
        restored.accessInstructions,
        JSON.stringify(old.links),
        JSON.stringify(restored.connections),
        restored.lifecycle,
        restored.seekingOrganizer,
        restored.publicPhone,
        restored.publicEmail,
        restored.publicAddress,
        restored.openingHours,
      ],
    );
  });
  res.json({ ok: true });
});

listings.get("/facets", async (_req, res) => {
  const [tags, locations, kinds] = await Promise.all([
    pool.query(
      "SELECT DISTINCT unnest(tags) AS tag FROM listings WHERE status='published' ORDER BY tag",
    ),
    pool.query(
      "SELECT DISTINCT location FROM listings WHERE status='published' AND location IS NOT NULL ORDER BY location",
    ),
    pool.query(
      "SELECT kind, count(*)::int AS count FROM listings WHERE status='published' GROUP BY kind",
    ),
  ]);
  res.json({
    tags: tags.rows.map((r) => r.tag),
    locations: locations.rows.map((r) => r.location),
    kinds: kinds.rows,
  });
});

listings.get("/", async (req, res) => {
  const parsed = listingQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid directory filters or page." });
    return;
  }
  const {
    q,
    kind,
    access,
    tag,
    tags,
    location,
    sort,
    page,
    pageSize,
    connection,
    lifecycle,
    needs,
  } = parsed.data;
  const params: unknown[] = [];
  const where = ["status='published'"];
  const bind = (value: unknown) => {
    params.push(value);
    return "$" + params.length;
  };
  if (q) {
    const p = bind(q);
    where.push(
      `(search_vector @@ websearch_to_tsquery('english', ${p}) OR name ILIKE '%' || ${p} || '%')`,
    );
  }
  if (kind === "business")
    where.push(
      `EXISTS (SELECT 1 FROM tag_names n JOIN tag_names chosen ON chosen.tag_id=n.tag_id WHERE chosen.key='business' AND n.key=ANY(SELECT lower(t) FROM unnest(listings.tags) t))`,
    );
  else if (kind) where.push(`kind=${bind(kind)}`);
  if (access) where.push(`access_mode=${bind(access)}`);
  if (tag)
    where.push(
      `EXISTS (SELECT 1 FROM tag_names n JOIN tag_names chosen ON chosen.tag_id=n.tag_id WHERE chosen.key=lower(${bind(tag)}) AND n.key=ANY(SELECT lower(t) FROM unnest(listings.tags) t))`,
    );
  if (tags)
    for (const id of new Set(tags.split(",")))
      where.push(
        `EXISTS (SELECT 1 FROM tag_names n JOIN tag_definitions chosen ON n.tag_id=COALESCE(chosen.merged_into,chosen.id) WHERE chosen.id=${bind(id)}::uuid AND n.key=ANY(SELECT lower(t) FROM unnest(listings.tags) t))`,
      );
  if (location)
    where.push(
      `(CASE WHEN lower(btrim(location))='nh' THEN 'new hampshire' ELSE lower(btrim(regexp_replace(btrim(location), ',?\\s+(nh|new hampshire)$', '', 'i'))) END)=${bind(locationMatchKey(location))}`,
    );
  if (lifecycle) where.push(`lifecycle=${bind(lifecycle)}`);
  if (needs === "organizer") where.push("seeking_organizer=true");
  if (needs === "joining_details")
    where.push(
      "NOT listing_has_joining_details(connections,access_instructions,public_phone,public_email)",
    );
  if (connection)
    where.push(
      `connections @> ${bind(JSON.stringify([{ type: connection }]))}::jsonb`,
    );
  const filter = where.join(" AND ");
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM listings WHERE ${filter}`,
    params,
  );
  const fresh = (column: string) =>
    `${column} > now()-interval '${CONFIRMATION_FRESH_DAYS} days' AND ${column}<=now()`;
  const priority = `(CASE WHEN ${fresh("editor_reviewed_at")} THEN 2 ELSE 0 END + CASE WHEN ${fresh("self_confirmed_at")} THEN 1 ELSE 0 END)`;
  const order =
    sort === "recent"
      ? "updated_at DESC, id"
      : sort === "confirmed"
        ? `${priority} DESC,lower(name),id`
        : "lower(name), id";
  const limit = bind(pageSize);
  const offset = bind((page - 1) * pageSize);
  const result = await pool.query(
    `SELECT ${columns} FROM listings WHERE ${filter} ORDER BY listing_has_joining_details(connections,access_instructions,public_phone,public_email) DESC, ${order} LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ items: result.rows, total: count.rows[0].total, page, pageSize });
});

listings.get("/:id", async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) {
    res.status(404).json({ error: "Listing not found." });
    return;
  }
  const result = await pool.query(
    `SELECT ${columns} FROM listings WHERE id=$1 AND status='published'`,
    [req.params.id],
  );
  if (!result.rows.length) {
    res.status(404).json({ error: "Listing not found." });
    return;
  }
  res.json(result.rows[0]);
});

listings.post("/", limit("submission", 20, 60), async (req, res) => {
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Please check the listing fields.",
      details: parsed.error.flatten(),
    });
    return;
  }
  const e = parsed.data;
  validateLocation(e.location);
  // A stale tab must never silently turn an account-owned submission anonymous,
  // or assign it to a different account that signed in on another tab.
  const identity = z
    .object({ expectedAccountId: z.uuid().nullable().optional() })
    .parse(req.body);
  if (
    identity.expectedAccountId !== undefined &&
    identity.expectedAccountId !== (req.account?.id ?? null)
  )
    throw new HttpError(
      409,
      "Your sign-in changed. Sign in again and reload the form before submitting. No entry was created.",
    );
  const connections =
    e.connections ??
    legacyConnections({ url: e.url, contact_url: e.contactUrl });
  const result = await transaction(async (client) => {
    if (req.account) await requireCurrentSession(client, req);
    e.tags = await canonicalTags(client, e.tags);
    e.tags = await syncPlatformTags(client, e.tags, connections);
    e.kind = "entry";
    await context(client, req, "create");
    return client.query(
      `INSERT INTO listings
    (kind,name,summary,description,url,contact_url,location,tags,access_mode,access_instructions,owner_id,status,connections,links,lifecycle,seeking_organizer,public_phone,public_email,public_address,opening_hours)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id,status`,
      [
        e.kind,
        e.name,
        e.summary,
        e.description,
        e.connections ? (connections[0]?.url ?? null) : e.url || null,
        e.connections ? null : e.contactUrl || null,
        e.location || null,
        e.tags,
        e.accessMode,
        e.accessInstructions,
        req.account?.id ?? null,
        submissionPolicy(),
        JSON.stringify(connections),
        JSON.stringify(connections.map(({ label, url }) => ({ label, url }))),
        e.lifecycle,
        e.seekingOrganizer,
        e.publicPhone,
        e.publicEmail,
        e.publicAddress,
        e.openingHours,
      ],
    );
  });
  res.status(201).json(result.rows[0]);
});

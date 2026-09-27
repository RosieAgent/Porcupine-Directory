import { createHash } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import {
  listingQuerySchema,
  serviceListingPatchSchema,
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
  setAuditContext,
  audit,
  requestActor,
} from "../security.js";

function validateLocation(value: string, previous = "") {
  if (value && !findLocation(value) && value !== normalizeLocation(previous))
    throw new HttpError(
      400,
      "Select a New Hampshire town, region, county or statewide location from the list.",
    );
}

export const listings = Router();
export const publicListingColumns = `id, kind, name, summary, description, url, contact_url AS "contactUrl", location, tags,
  access_mode AS "accessMode", access_instructions AS "accessInstructions", source_name AS "sourceName",
  source_url AS "sourceUrl", last_confirmed_at AS "lastConfirmedAt", imported_at AS "importedAt", links,
  version,status,connections,self_confirmed_at AS "selfConfirmedAt",editor_reviewed_at AS "editorReviewedAt",
  lifecycle,seeking_organizer AS "seekingOrganizer",public_phone AS "publicPhone",public_email AS "publicEmail",public_address AS "publicAddress",opening_hours AS "openingHours",reference_sources AS "referenceSources",
  NOT listing_has_joining_details(connections,access_instructions,public_phone,public_email) AS "missingJoiningDetails",
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', image.id,
    'url', '/api/listings/' || listings.id || '/images/' || image.id,
    'altText', image.alt_text,
    'caption', image.caption,
    'shareable', image.shareable,
    'isLead', image.is_lead,
    'sortOrder', image.sort_order,
    'createdAt', image.created_at
  ) ORDER BY image.is_lead DESC, image.sort_order, image.created_at, image.id)
  FROM entry_images image
  WHERE image.listing_id=listings.id AND image.deleted_at IS NULL), '[]'::jsonb) AS images`;

const privateImageColumns = `id,
  '/api/listings/' || listing_id || '/images/' || id AS url,
  alt_text AS "altText", caption, shareable, is_lead AS "isLead",
  sort_order AS "sortOrder", created_at AS "createdAt"`;

export const imageMetadataSchema = z.object({
  altText: z.string().trim().max(200).default(""),
  caption: z.string().trim().max(300).default(""),
  shareable: z.boolean().default(false),
  reason: z.string().trim().min(3).max(500),
});
const browserImageMetadataSchema = imageMetadataSchema.extend({
  reason: z.string().trim().max(500).default(""),
});
const imagePatchSchema = imageMetadataSchema.partial().extend({
  reason: z.string().trim().max(500).default(""),
});

export function imageUrl(id: string, imageId: string) {
  return `/api/listings/${id}/images/${imageId}`;
}

export function imageData(buffer: Buffer, mimeType: string) {
  const jpeg =
    buffer.length >= 3 &&
    buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png =
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP";
  if (
    (mimeType === "image/jpeg" && jpeg) ||
    (mimeType === "image/png" && png) ||
    (mimeType === "image/webp" && webp)
  )
    return buffer;
  throw new HttpError(400, "The image file type could not be verified.");
}

async function authorizedImageListing(client: PoolClient, req: Request) {
  const id = z.uuid().parse(req.params.id);
  const { rows } = await client.query(
    "SELECT id,owner_id,status FROM listings WHERE id=$1 FOR UPDATE",
    [id],
  );
  const listing = rows[0];
  if (!listing) throw new HttpError(404, "Entry not found.");
  if (listing.owner_id !== req.account!.id) assertStaff(req);
  return listing;
}

function requireChangeReason(req: Request, ownerId: string, reason: string) {
  if (ownerId !== req.account?.id && reason.trim().length < 3)
    throw new HttpError(
      400,
      "Provide a reason for this change because you are not the entry owner.",
    );
}

async function auditImage(
  client: PoolClient,
  req: Request,
  listingId: string,
  action: string,
  reason: string,
  details: Record<string, unknown>,
) {
  await context(client, req, `image-${action}`, reason);
  const actor = requestActor(req);
  await audit(client, actor.id ?? null, listingId, `listing.image.${action}`, {
    actorType: actor.type,
    subjectType: "listing",
    requestId: req.requestId,
    reason,
    details,
  });
}

export async function insertListingImage(
  client: PoolClient,
  req: Request,
  listingId: string,
  data: Buffer,
  mimeType: string,
  metadata: z.infer<typeof imageMetadataSchema>,
) {
  const count = await client.query(
    "SELECT count(*)::int AS total FROM entry_images WHERE listing_id=$1 AND deleted_at IS NULL",
    [listingId],
  );
  if (count.rows[0].total >= 12)
    throw new HttpError(400, "An entry can have up to 12 active images.");
  if (metadata.shareable)
    await client.query(
      "UPDATE entry_images SET is_lead=false,shareable=false,updated_at=now() WHERE listing_id=$1 AND deleted_at IS NULL",
      [listingId],
    );
  const { rows } = await client.query(
    `INSERT INTO entry_images
      (listing_id,data,mime_type,byte_size,alt_text,caption,shareable,is_lead,sort_order,uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
       COALESCE((SELECT max(sort_order)+1 FROM entry_images WHERE listing_id=$1 AND deleted_at IS NULL),0),$9)
     RETURNING id,alt_text AS "altText",caption,shareable,is_lead AS "isLead",
       sort_order AS "sortOrder",created_at AS "createdAt"`,
    [
      listingId,
      data,
      mimeType,
      data.length,
      metadata.altText,
      metadata.caption,
      metadata.shareable,
      metadata.shareable,
      req.account?.id ?? null,
    ],
  );
  await auditImage(client, req, listingId, "uploaded", metadata.reason, {
    imageId: rows[0].id,
    bytes: data.length,
    mimeType,
    shareable: metadata.shareable,
    communityCard: metadata.shareable,
    serviceAccount: req.serviceAccount?.name,
  });
  return rows[0];
}

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
    `SELECT ${publicListingColumns} FROM listings WHERE ${filter} ORDER BY updated_at DESC,id LIMIT 24 OFFSET $${params.length + 1}`,
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
    isOwner: owner,
    canEdit: owner || isEditor(req),
    canConfirm: owner,
    canReview: isEditor(req),
    canDelete: owner || isEditor(req),
    reasonRequired: !owner,
  });
});
listings.get("/:id/edit", requireUser, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { rows } = await pool.query(
    `SELECT ${publicListingColumns},owner_id FROM listings WHERE id=$1`,
    [z.uuid().parse(req.params.id)],
  );
  if (!rows[0]) throw new HttpError(404, "Entry not found.");
  if (rows[0].owner_id !== req.account!.id) assertStaff(req);
  const entry = { ...rows[0] };
  const images = await pool.query(
    `SELECT ${privateImageColumns} FROM entry_images WHERE listing_id=$1 AND deleted_at IS NULL
     ORDER BY is_lead DESC,sort_order,created_at,id`,
    [rows[0].id],
  );
  entry.images = images.rows.map((image) => ({
    ...image,
    url: imageUrl(rows[0].id, image.id),
  }));
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
  await setAuditContext(client, req, action, reason);
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
  reason: z.string().trim().max(500).default(""),
});
const deleteSchema = z.object({
  confirmation: z.string().trim().min(1).max(160),
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
export async function applyServiceListingPatch(
  client: PoolClient,
  req: Request,
  id: string,
  data: z.infer<typeof serviceListingPatchSchema>,
) {
  const { rows } = await client.query(
    "SELECT * FROM listings WHERE id=$1 FOR UPDATE",
    [id],
  );
  const entry = rows[0];
  if (!entry) throw new HttpError(404, "Entry not found.");
  if (entry.version !== data.expectedVersion)
    throw new HttpError(
      409,
      "This entry changed. Reload it and review the latest version before saving.",
    );
  const current = submissionSchema.parse({
    ...entry,
    url: entry.url || "",
    location: entry.location || "",
    contactUrl: entry.contact_url || "",
    accessMode: entry.access_mode,
    accessInstructions: entry.access_instructions,
    connections: entry.connections ?? legacyConnections(entry),
    seekingOrganizer: entry.seeking_organizer ?? false,
    publicPhone: entry.public_phone ?? "",
    publicEmail: entry.public_email ?? "",
    publicAddress: entry.public_address ?? "",
    openingHours: entry.opening_hours ?? "",
  });
  const next = submissionSchema.parse({ ...current, ...data.changes });
  next.kind = entry.kind;
  if (!Object.prototype.hasOwnProperty.call(data.changes, "connections"))
    next.connections = undefined;
  next.tags = await canonicalTags(client, next.tags, entry.tags);
  validateLocation(next.location, entry.location ?? "");
  const changedFields = Object.keys(data.changes);
  const details = {
    ...data.context,
    changedFields,
    serviceAccount: req.serviceAccount?.name,
  };
  await setAuditContext(
    client,
    req,
    "service.listing.updated",
    data.reason,
    details,
  );
  await updateContent(
    client,
    entry.id,
    next,
    entry,
    Object.prototype.hasOwnProperty.call(data.changes, "referenceSources")
      ? data.changes.referenceSources
      : undefined,
  );
  await audit(
    client,
    req.serviceAccount?.id ?? null,
    entry.id,
    "listing.updated",
    {
      actorType: "service_account",
      subjectType: "listing",
      requestId: req.requestId,
      reason: data.reason,
      details,
    },
  );
  return { id: entry.id, version: entry.version + 1 };
}
listings.put("/:id", requireUser, async (req, res) => {
  const data = editSchema.parse(req.body);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    const entry = await lockedEntry(client, req, data.version);
    requireChangeReason(req, entry.owner_id, data.reason);
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
    requireChangeReason(req, entry.owner_id, data.reason);
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
listings.delete("/:id", requireUser, async (req, res) => {
  const data = deleteSchema.parse(req.body);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    const { rows } = await client.query(
      "SELECT * FROM listings WHERE id=$1 FOR UPDATE",
      [z.uuid().parse(req.params.id)],
    );
    const entry = rows[0];
    if (!entry) throw new HttpError(404, "Entry not found.");
    if (data.confirmation !== entry.name)
      throw new HttpError(
        400,
        "Type the entry name exactly to confirm permanent deletion.",
      );
    if (entry.owner_id !== req.account!.id) assertStaff(req);

    const snapshot = Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== "search_vector"),
    );
    const details = {
      name: entry.name,
      version: entry.version,
      status: entry.status,
      ownerId: entry.owner_id,
      snapshot,
    };
    await context(client, req, "delete", data.reason);
    await audit(client, req.account!.id, entry.id, "listing.deleted", {
      actorType: "account",
      subjectType: "listing",
      requestId: req.requestId,
      reason: data.reason,
      details,
    });

    // Revision, ownership, and moderation rows are immutable audit history.
    // Migration 025 removes only the foreign-key blockers so these records can
    // retain the deleted listing UUID without allowing the listing to survive.
    // Bookmarks and entry images use ON DELETE CASCADE and are removed with it.
    await client.query("DELETE FROM listings WHERE id=$1", [entry.id]);
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
    requireChangeReason(req, entry.owner_id, data.reason);
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

listings.post(
  "/:id/images",
  requireUser,
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: "5mb",
  }),
  async (req, res) => {
    const mimeType = req.get("content-type")?.split(";", 1)[0] ?? "";
    const data = imageData(
      Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      mimeType,
    );
    const metadata = browserImageMetadataSchema.parse({
      altText: req.get("x-image-alt") ?? "",
      caption: req.get("x-image-caption") ?? "",
      shareable: req.get("x-image-shareable") === "true",
      reason: req.get("x-image-reason") ?? "",
    });
    if (metadata.shareable && metadata.altText.length < 3)
      throw new HttpError(
        400,
        "Add a short description before using an image as a community card image.",
      );
    const image = await transaction(async (client) => {
      await requireCurrentSession(client, req);
      const listing = await authorizedImageListing(client, req);
      requireChangeReason(req, listing.owner_id, metadata.reason);
      return insertListingImage(
        client,
        req,
        listing.id,
        data,
        mimeType,
        metadata,
      );
    });
    res.status(201).json({
      ...image,
      id: image.id,
      url: imageUrl(String(req.params.id), image.id),
    });
  },
);

listings.patch("/:id/images/:imageId", requireUser, async (req, res) => {
  const data = imagePatchSchema.parse(req.body);
  const image = await transaction(async (client) => {
    await requireCurrentSession(client, req);
    const listing = await authorizedImageListing(client, req);
    requireChangeReason(req, listing.owner_id, data.reason);
    const currentResult = await client.query(
      `SELECT id,alt_text AS "altText",caption,shareable,is_lead AS "isLead"
       FROM entry_images WHERE id=$1 AND listing_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [z.uuid().parse(req.params.imageId), listing.id],
    );
    const current = currentResult.rows[0];
    if (!current) throw new HttpError(404, "Image not found.");
    const nextCommunityCard = data.shareable ?? current.isLead;
    const nextShareable = nextCommunityCard;
    const nextLead = nextCommunityCard;
    const nextAltText = data.altText ?? current.altText;
    if (nextShareable && nextAltText.trim().length < 3)
      throw new HttpError(
        400,
        "Add a short description before using an image as a community card image.",
      );
    if (nextLead)
      await client.query(
        "UPDATE entry_images SET is_lead=false,shareable=false,updated_at=now() WHERE listing_id=$1 AND deleted_at IS NULL AND id<>$2",
        [listing.id, current.id],
      );
    const result = await client.query(
      `UPDATE entry_images SET alt_text=$2,caption=$3,shareable=$4,is_lead=$5,updated_at=now()
       WHERE id=$1
       RETURNING id,alt_text AS "altText",caption,shareable,is_lead AS "isLead",
         sort_order AS "sortOrder",created_at AS "createdAt"`,
      [
        current.id,
        nextAltText,
        data.caption ?? current.caption,
        nextShareable,
        nextLead,
      ],
    );
    await auditImage(client, req, listing.id, "updated", data.reason, {
      imageId: current.id,
      changedFields: Object.keys(data).filter((field) => field !== "reason"),
      communityCard: nextCommunityCard,
    });
    return result.rows[0];
  });
  res.json({ ...image, url: imageUrl(String(req.params.id), image.id) });
});

listings.delete("/:id/images/:imageId", requireUser, async (req, res) => {
  const data = z
    .object({ reason: z.string().trim().max(500).default("") })
    .parse(req.body);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    const listing = await authorizedImageListing(client, req);
    requireChangeReason(req, listing.owner_id, data.reason);
    const current = await client.query(
      "SELECT id FROM entry_images WHERE id=$1 AND listing_id=$2 AND deleted_at IS NULL FOR UPDATE",
      [z.uuid().parse(req.params.imageId), listing.id],
    );
    if (!current.rows[0]) throw new HttpError(404, "Image not found.");
    await client.query(
      "UPDATE entry_images SET deleted_at=now(),shareable=false,is_lead=false,updated_at=now() WHERE id=$1",
      [current.rows[0].id],
    );
    await auditImage(client, req, listing.id, "removed", data.reason, {
      imageId: current.rows[0].id,
      softDeleted: true,
    });
  });
  res.json({ ok: true });
});

listings.get("/:id/images/:imageId", async (req, res) => {
  const listingId = z.uuid().parse(req.params.id);
  const imageId = z.uuid().parse(req.params.imageId);
  const { rows } = await pool.query(
    `SELECT image.data,image.mime_type AS "mimeType",image.shareable,
       listing.status,listing.owner_id
     FROM entry_images image
     JOIN listings listing ON listing.id=image.listing_id
     WHERE image.id=$1 AND image.listing_id=$2 AND image.deleted_at IS NULL`,
    [imageId, listingId],
  );
  const image = rows[0];
  if (!image) throw new HttpError(404, "Image not found.");
  const publicImage = image.status === "published";
  if (!publicImage) {
    if (!req.account) throw new HttpError(404, "Image not found.");
    if (image.owner_id !== req.account.id) assertStaff(req);
    res.set("Cache-Control", "private, no-store");
  } else {
    res.set("Cache-Control", "public, max-age=3600");
  }
  res.type(image.mimeType).send(image.data);
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
    `SELECT ${publicListingColumns} FROM listings WHERE ${filter} ORDER BY listing_has_joining_details(connections,access_instructions,public_phone,public_email) DESC, ${order} LIMIT ${limit} OFFSET ${offset}`,
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
    `SELECT ${publicListingColumns},owner_id FROM listings WHERE id=$1`,
    [req.params.id],
  );
  if (!result.rows.length) {
    res.status(404).json({ error: "Listing not found." });
    return;
  }
  const listing = result.rows[0];
  if (listing.status !== "published") {
    if (!req.account || (listing.owner_id !== req.account.id && !isEditor(req)))
      throw new HttpError(404, "Listing not found.");
  }
  delete listing.owner_id;
  res.json(listing);
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
  const rawIdempotencyKey = req.get("idempotency-key");
  const idempotencyKey = rawIdempotencyKey
    ? z.string().trim().min(16).max(200).parse(rawIdempotencyKey)
    : null;
  const requestHash = idempotencyKey
    ? createHash("sha256")
        .update(
          JSON.stringify({
            body: req.body,
            accountId: req.account?.id ?? null,
          }),
        )
        .digest("hex")
    : null;
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
    if (idempotencyKey && requestHash) {
      const inserted = await client.query(
        `INSERT INTO listing_submission_idempotency(idempotency_key,request_hash)
         VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [idempotencyKey, requestHash],
      );
      if (!inserted.rowCount) {
        const existing = await client.query(
          `SELECT request_hash,response FROM listing_submission_idempotency
           WHERE idempotency_key=$1 FOR UPDATE`,
          [idempotencyKey],
        );
        if (existing.rows[0]?.request_hash !== requestHash)
          throw new HttpError(
            409,
            "That submission key was already used for different entry data.",
          );
        if (existing.rows[0]?.response)
          return { rows: [existing.rows[0].response] };
        throw new HttpError(409, "That submission is already being processed.");
      }
    }
    e.tags = await canonicalTags(client, e.tags);
    e.tags = await syncPlatformTags(client, e.tags, connections);
    e.kind = "entry";
    await context(client, req, "create");
    const created = await client.query(
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
    if (idempotencyKey)
      await client.query(
        `UPDATE listing_submission_idempotency SET response=$2::jsonb
         WHERE idempotency_key=$1`,
        [idempotencyKey, JSON.stringify(created.rows[0])],
      );
    return created;
  });
  res.status(201).json(result.rows[0]);
});

import { createHash } from "node:crypto";
import express from "express";
import { Router } from "express";
import { z } from "zod";
import {
  serviceListingCreateSchema,
  serviceListingImagePatchSchema,
  serviceListingPatchSchema,
} from "../../shared/contracts.js";
import { legacyConnections } from "../../shared/connections.js";
import { pool } from "../db.js";
import { canonicalTags, syncPlatformTags } from "../tags.js";
import {
  applyServiceListingPatch,
  imageData,
  imageMetadataSchema,
  imageUrl,
  insertListingImage,
  publicListingColumns,
  updateListingImageMetadata,
  validateLocation,
} from "./listings.js";
import {
  authenticateServiceToken,
  requireServiceScope,
} from "../service-accounts.js";
import {
  audit,
  HttpError,
  setAuditContext,
  submissionPolicy,
  transaction,
} from "../security.js";

export const serviceListings = Router();
serviceListings.use(authenticateServiceToken);

function idempotencyKey(req: express.Request) {
  return z.string().trim().min(8).max(200).parse(req.get("idempotency-key"));
}

function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function idempotent<T>(
  client: import("pg").PoolClient,
  req: express.Request,
  key: string,
  hash: string,
  operation: () => Promise<T>,
): Promise<T> {
  const inserted = await client.query(
    `INSERT INTO service_request_dedup(service_account_id,idempotency_key,request_hash)
     VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
    [req.serviceAccount!.id, key, hash],
  );
  if (!inserted.rowCount) {
    const existing = await client.query(
      `SELECT request_hash,response FROM service_request_dedup
       WHERE service_account_id=$1 AND idempotency_key=$2 FOR UPDATE`,
      [req.serviceAccount!.id, key],
    );
    if (existing.rows[0]?.request_hash !== hash)
      throw new HttpError(
        409,
        "That idempotency key was already used for a different request.",
      );
    if (existing.rows[0]?.response) return existing.rows[0].response as T;
    throw new HttpError(409, "That request is already being processed.");
  }
  const result = await operation();
  await client.query(
    `UPDATE service_request_dedup SET response=$3::jsonb
     WHERE service_account_id=$1 AND idempotency_key=$2`,
    [req.serviceAccount!.id, key, JSON.stringify(result)],
  );
  return result;
}

serviceListings.get(
  "/listings/:id",
  requireServiceScope("listings:read"),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.set("Cache-Control", "no-store");
    const { rows } = await pool.query(
      `SELECT ${publicListingColumns}
       FROM listings WHERE id=$1 AND status='published'`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, "Entry not found.");
    res.json(rows[0]);
  },
);

serviceListings.post(
  "/listings",
  requireServiceScope("listings:create"),
  async (req, res) => {
    const data = serviceListingCreateSchema.parse(req.body);
    const key = idempotencyKey(req);
    const hash = requestHash(data);
    const response = await transaction((client) =>
      idempotent(client, req, key, hash, async () => {
        const connections =
          data.connections ??
          legacyConnections({ url: data.url, contact_url: data.contactUrl });
        validateLocation(data.location);
        data.tags = await canonicalTags(client, data.tags);
        data.tags = await syncPlatformTags(client, data.tags, connections);
        const { reason, context, referenceSources = [], ...entry } = data;
        const details = {
          ...(context ?? {}),
          changedFields: [
            ...Object.keys(entry),
            ...(referenceSources.length ? ["referenceSources"] : []),
          ].sort(),
          serviceAccount: req.serviceAccount?.name,
        };
        await setAuditContext(
          client,
          req,
          "service.listing.created",
          reason,
          details,
        );
        const created = await client.query(
          `INSERT INTO listings
            (kind,name,summary,description,url,contact_url,location,tags,
             access_mode,access_instructions,status,connections,links,lifecycle,
             seeking_organizer,public_phone,public_email,public_address,
             opening_hours,reference_sources)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)
           RETURNING id,version,status`,
          [
            entry.kind,
            entry.name,
            entry.summary,
            entry.description,
            entry.connections
              ? (connections[0]?.url ?? null)
              : entry.url || null,
            entry.connections ? null : entry.contactUrl || null,
            entry.location || null,
            entry.tags,
            entry.accessMode,
            entry.accessInstructions,
            submissionPolicy(),
            JSON.stringify(connections),
            JSON.stringify(
              connections.map(({ label, url }) => ({ label, url })),
            ),
            entry.lifecycle,
            entry.seekingOrganizer,
            entry.publicPhone,
            entry.publicEmail,
            entry.publicAddress,
            entry.openingHours,
            JSON.stringify(referenceSources),
          ],
        );
        const listing = created.rows[0];
        await audit(
          client,
          req.serviceAccount!.id,
          listing.id,
          "listing.created",
          {
            actorType: "service_account",
            subjectType: "listing",
            requestId: req.requestId,
            reason,
            details,
          },
        );
        return { ...listing, requestId: req.requestId };
      }),
    );
    res.status(201).json(response);
  },
);

serviceListings.patch(
  "/listings/:id",
  requireServiceScope("listings:edit"),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const data = serviceListingPatchSchema.parse(req.body);
    const key = idempotencyKey(req);
    const hash = requestHash({ id, data });
    const response = await transaction(async (client) =>
      idempotent(client, req, key, hash, async () => {
        const changed = await applyServiceListingPatch(client, req, id, data);
        return {
          ok: true as const,
          listingId: changed.id,
          version: changed.version,
          requestId: req.requestId,
        };
      }),
    );
    res.json(response);
  },
);

serviceListings.post(
  "/listings/:id/images",
  requireServiceScope("listings:edit"),
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: "5mb",
  }),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const key = idempotencyKey(req);
    const mimeType = req.get("content-type")?.split(";", 1)[0] ?? "";
    const data = imageData(
      Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      mimeType,
    );
    const metadata = imageMetadataSchema.parse({
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
    const hash = createHash("sha256")
      .update(data)
      .update(JSON.stringify({ id, mimeType, metadata }))
      .digest("hex");
    const response = await transaction(async (client) =>
      idempotent(client, req, key, hash, async () => {
        const listing = await client.query(
          "SELECT id FROM listings WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!listing.rows[0]) throw new HttpError(404, "Entry not found.");
        const image = await insertListingImage(
          client,
          req,
          id,
          data,
          mimeType,
          metadata,
        );
        return {
          ...image,
          url: imageUrl(String(id), image.id),
          requestId: req.requestId,
        };
      }),
    );
    res.status(201).json(response);
  },
);

serviceListings.patch(
  "/listings/:id/images/:imageId",
  requireServiceScope("listings:edit"),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const imageId = z.uuid().parse(req.params.imageId);
    const data = serviceListingImagePatchSchema.parse(req.body);
    const key = idempotencyKey(req);
    const hash = requestHash({ id, imageId, data });
    const response = await transaction(async (client) =>
      idempotent(client, req, key, hash, async () => {
        const listing = await client.query(
          "SELECT id FROM listings WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!listing.rows[0]) throw new HttpError(404, "Entry not found.");
        const image = await updateListingImageMetadata(
          client,
          req,
          id,
          imageId,
          data,
        );
        return {
          ...image,
          url: imageUrl(String(id), image.id),
          requestId: req.requestId,
        };
      }),
    );
    res.json(response);
  },
);

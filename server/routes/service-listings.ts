import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { serviceListingPatchSchema } from "../../shared/contracts.js";
import { pool } from "../db.js";
import { applyServiceListingPatch, publicListingColumns } from "./listings.js";
import {
  authenticateServiceToken,
  requireServiceScope,
} from "../service-accounts.js";
import { HttpError, transaction } from "../security.js";

export const serviceListings = Router();
serviceListings.use(authenticateServiceToken);

serviceListings.get(
  "/listings/:id",
  requireServiceScope("listings:read"),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.set("Cache-Control", "no-store");
    const { rows } = await pool.query(
      `SELECT ${publicListingColumns} FROM listings WHERE id=$1`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, "Entry not found.");
    res.json(rows[0]);
  },
);

serviceListings.patch(
  "/listings/:id",
  requireServiceScope("listings:write"),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const data = serviceListingPatchSchema.parse(req.body);
    const idempotencyKey = z
      .string()
      .trim()
      .min(8)
      .max(200)
      .parse(req.get("idempotency-key"));
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ id, data }))
      .digest("hex");
    const response = await transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO service_request_dedup(service_account_id,idempotency_key,request_hash)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [req.serviceAccount!.id, idempotencyKey, requestHash],
      );
      if (!inserted.rowCount) {
        const existing = await client.query(
          `SELECT request_hash,response FROM service_request_dedup
           WHERE service_account_id=$1 AND idempotency_key=$2 FOR UPDATE`,
          [req.serviceAccount!.id, idempotencyKey],
        );
        if (existing.rows[0]?.request_hash !== requestHash)
          throw new HttpError(
            409,
            "That idempotency key was already used for a different request.",
          );
        if (existing.rows[0]?.response) return existing.rows[0].response;
        throw new HttpError(409, "That request is already being processed.");
      }
      const changed = await applyServiceListingPatch(client, req, id, data);
      const result = {
        ok: true as const,
        listingId: changed.id,
        version: changed.version,
        requestId: req.requestId,
      };
      await client.query(
        `UPDATE service_request_dedup SET response=$3::jsonb
         WHERE service_account_id=$1 AND idempotency_key=$2`,
        [req.serviceAccount!.id, idempotencyKey, JSON.stringify(result)],
      );
      return result;
    });
    res.json(response);
  },
);

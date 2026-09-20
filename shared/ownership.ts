import { z } from "zod";
import { usernameSchema } from "./auth.js";

export const OWNERSHIP_EXPIRY_DAYS = 7;
export const nominationSchema = z.object({
  username: usernameSchema,
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
export const ownershipStateSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
  "revoked",
]);
export const ownershipOfferSchema = z.object({
  id: z.uuid(),
  listingId: z.uuid(),
  listingName: z.string(),
  listingVersion: z.number().int(),
  listingStatus: z.enum(["published", "pending_review", "archived"]),
  state: ownershipStateSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
});
export const ownershipInboxSchema = z.object({
  items: z.array(ownershipOfferSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});
export const ownershipAssignmentSchema = z.object({
  ownerUsername: z.string().nullable(),
  externalOwnerLabel: z.string().nullable().default(null),
  version: z.number().int(),
  pending: ownershipOfferSchema
    .extend({ recipientUsername: z.string() })
    .nullable(),
});
export const ownershipCreatedSchema = z.object({ id: z.uuid() });

// Staff-only directory: never exposes email, recovery details or public identity.
export const ownershipCandidatesSchema = z.object({
  items: z.array(
    z.object({ id: z.uuid(), username: z.string(), alias: z.string() }),
  ),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const externalOwnerSchema = z.object({
  label: z.string().trim().max(80),
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

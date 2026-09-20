import { z } from "zod";
import { webUrl, connectionsSchema, connectionTypes } from "./connections.js";
import { normalizeLocation } from "./locations.js";
import { eventLocationFields } from "./event-location-fields.js";
export { webUrl } from "./connections.js";

export const listingKinds = [
  "entry",
  "group",
  "channel",
  "business",
  "resource",
  "organization",
] as const;
export const accessModes = [
  "open",
  "public",
  "invite_only",
  "private",
  "unknown",
] as const;
export type ListingKind = (typeof listingKinds)[number];
export type AccessMode = (typeof accessModes)[number];
export const kindLabels: Record<ListingKind, string> = {
  entry: "Entries",
  group: "Groups",
  channel: "Channels",
  business: "Businesses",
  resource: "Resources",
  organization: "Organizations",
};
export const kindPaths: Record<ListingKind, string> = {
  entry: "/directory",
  group: "/groups",
  channel: "/channels",
  business: "/businesses",
  resource: "/resources",
  organization: "/organizations",
};
export const accessLabels: Record<AccessMode, string> = {
  open: "Open to all",
  public: "Public / moderated",
  invite_only: "Invite only",
  private: "Private",
  unknown: "Access not confirmed",
};
const optionalUrl = z.union([webUrl, z.literal("")]).default("");
export const lifecycleLabels = {
  unknown: "Not sure yet",
  existing: "Existing",
  proposed: "Idea / proposed",
};
export const lifecycleSchema = z.enum(["unknown", "existing", "proposed"]);
export const entryContextSchema = z.object({
  lifecycle: lifecycleSchema.default("unknown"),
  seekingOrganizer: z.boolean().default(false),
  publicPhone: z
    .string()
    .trim()
    .max(40)
    .regex(
      /^[+0-9(). -]*$/,
      "Use a public telephone number, without extensions.",
    )
    .refine(
      (value) => !value || value.replace(/\D/g, "").length >= 7,
      "Use a complete public phone number.",
    )
    .default(""),
  publicEmail: z.union([z.email().max(254), z.literal("")]).default(""),
  publicAddress: z.string().trim().max(300).default(""),
  openingHours: z.string().trim().max(500).default(""),
});
export const submissionSchema = z.object({
  ...entryContextSchema.shape,
  kind: z.enum(listingKinds).default("entry"),
  name: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(10).max(280),
  description: z.string().trim().max(4000).default(""),
  url: optionalUrl,
  contactUrl: optionalUrl,
  connections: connectionsSchema.optional(),
  location: z.string().trim().max(160).default("").transform(normalizeLocation),
  tags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  accessMode: z.enum(accessModes).default("unknown"),
  accessInstructions: z.string().trim().max(1000).default(""),
});
export type Submission = z.infer<typeof submissionSchema>;
export const referenceSourceSchema = z.object({
  label: z.string().trim().min(1).max(160),
  url: webUrl,
  checkedAt: z.iso.datetime(),
});
export const auditContextSchema = z
  .object({
    who: z.string().trim().max(200).optional(),
    what: z.string().trim().max(500).optional(),
    when: z.iso.datetime().optional(),
    where: z.string().trim().max(200).optional(),
    why: z.string().trim().max(500).optional(),
    how: z.string().trim().max(1000).optional(),
    sourceUrl: webUrl.optional(),
    sourceLabel: z.string().trim().max(160).optional(),
  })
  .strict();
const serviceListingChangesSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    summary: z.string().trim().min(10).max(280).optional(),
    description: z.string().trim().max(4000).optional(),
    url: z.union([webUrl, z.literal("")]).optional(),
    contactUrl: z.union([webUrl, z.literal("")]).optional(),
    location: z.string().trim().max(160).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    accessMode: z.enum(accessModes).optional(),
    accessInstructions: z.string().trim().max(1000).optional(),
    connections: connectionsSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
    seekingOrganizer: z.boolean().optional(),
    publicPhone: z
      .string()
      .trim()
      .max(40)
      .regex(
        /^[+0-9(). -]*$/,
        "Use a public telephone number, without extensions.",
      )
      .refine(
        (value) => !value || value.replace(/\D/g, "").length >= 7,
        "Use a complete public phone number.",
      )
      .optional(),
    publicEmail: z.union([z.email().max(254), z.literal("")]).optional(),
    publicAddress: z.string().trim().max(300).optional(),
    openingHours: z.string().trim().max(500).optional(),
    referenceSources: z.array(referenceSourceSchema).max(20).optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "Supply at least one listing field to change.",
  });
export const serviceListingPatchSchema = z.object({
  expectedVersion: z.number().int().positive(),
  changes: serviceListingChangesSchema,
  reason: z.string().trim().min(3).max(500),
  context: auditContextSchema.optional(),
});
export const listingSchema = z.object({
  ...entryContextSchema.shape,
  missingJoiningDetails: z.boolean(),
  referenceSources: z.array(referenceSourceSchema),
  id: z.uuid(),
  kind: z.enum(listingKinds),
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  url: z.string().nullable(),
  contactUrl: z.string().nullable(),
  location: z.string().nullable(),
  tags: z.array(z.string()),
  accessMode: z.enum(accessModes),
  accessInstructions: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string().nullable(),
  lastConfirmedAt: z.string().nullable(),
  importedAt: z.string().nullable(),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  connections: connectionsSchema,
  version: z.number().int(),
  status: z.enum(["published", "pending_review", "archived"]),
  selfConfirmedAt: z.string().nullable(),
  editorReviewedAt: z.string().nullable(),
});
export type Listing = z.infer<typeof listingSchema>;
export const eventSchema = z.object({
  ...eventLocationFields,
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  venue: z.string().nullable(),
  city: z.string().nullable(),
  url: z.string().nullable(),
  sourceKey: z.string(),
  allDay: z.boolean(),
  hidden: z.boolean(),
  lastSyncedAt: z.string(),
});
export type DirectoryEvent = z.infer<typeof eventSchema>;
const paging = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce
    .number()
    // Keep the previous sizes valid for old shared URLs while presenting the
    // new directory choices in the UI.
    .pipe(
      z.union([
        z.literal(12),
        z.literal(24),
        z.literal(25),
        z.literal(48),
        z.literal(50),
        z.literal(100),
      ]),
    )
    .default(25),
};
export const listingQuerySchema = z.object({
  ...paging,
  q: z.string().trim().max(200).default(""),
  kind: z.enum(listingKinds).optional(),
  access: z.enum(accessModes).optional(),
  tag: z.string().max(160).optional(),
  tags: z
    .string()
    .max(500)
    .refine(
      (value) =>
        value.split(",").length <= 12 &&
        value.split(",").every((id) => z.uuid().safeParse(id).success),
      "Use up to 12 catalog tag IDs",
    )
    .optional(),
  location: z.string().max(160).optional(),
  sort: z.enum(["confirmed", "name", "recent"]).default("confirmed"),
  lifecycle: lifecycleSchema.optional(),
  needs: z.enum(["joining_details", "organizer"]).optional(),
  connection: z.enum(connectionTypes).optional(),
  view: z.enum(["cards", "table"]).default("cards"),
});
export const eventQuerySchema = z
  .object({
    ...paging,
    q: z.string().trim().max(200).default(""),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "End date must follow start date.",
  });
export const calendarQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .refine((value) => value >= "2000-01" && value <= "2100-12"),
  q: z.string().trim().max(200).default(""),
});
export const calendarResponse = z.object({
  items: z.array(eventSchema),
  month: z.string(),
});
const pagination = {
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
};
export const listingsResponse = z.object({
  items: z.array(listingSchema),
  ...pagination,
});
export const eventsResponse = z.object({
  items: z.array(eventSchema),
  ...pagination,
});
export const facetsResponse = z.object({
  tags: z.array(z.string()),
  locations: z.array(z.string()),
  kinds: z.array(z.object({ kind: z.enum(listingKinds), count: z.number() })),
});
export const sourceSchema = z.object({
  sourceKey: z.string(),
  displayName: z.string(),
  sourceUrl: z.string(),
  lastSyncedAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastFinishedAt: z.string().nullable(),
  nextPollAt: z.string().nullable(),
  pollIntervalMinutes: z.number().nullable(),
  coverageFrom: z.string().nullable(),
  coverageTo: z.string().nullable(),
  skippedCount: z.number(),
  status: z.string(),
  itemCount: z.number(),
});
export type SourceStatus = z.infer<typeof sourceSchema>;
export const sourcesResponse = z.object({
  sources: z.array(sourceSchema),
});

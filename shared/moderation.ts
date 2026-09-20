import { z } from "zod";

export const REPORT_TEXT_LIMIT = 500;
export const reportReasons = {
  incorrect: "Incorrect or outdated information",
  broken_link: "Broken link or joining instructions",
  unavailable: "Group or service no longer available",
  inappropriate: "Spam or inappropriate content",
  other: "Other issue with this entry",
} as const;
export const reportReasonSchema = z.enum([
  "incorrect",
  "broken_link",
  "unavailable",
  "inappropriate",
  "other",
]);
export const reportIssueSchema = z
  .object({
    listingId: z.uuid(),
    reason: reportReasonSchema,
    text: z.string().trim().max(REPORT_TEXT_LIMIT).default(""),
    website: z.string().max(1000).default(""),
  })
  .strict();
export const reportReceiptSchema = z.object({ message: z.string() });
export const reportReceipt = {
  message: "Thank you. Your report will be considered by the review team.",
};
export const queueFilters = {
  all: "All needing review",
  unconfirmed: "Unconfirmed",
  missing: "Missing joining details",
  stale: "Stale confirmations",
  reported: "Open reports",
  pending: "Pending publication",
} as const;
export const queueFilterSchema = z.enum([
  "all",
  "unconfirmed",
  "missing",
  "stale",
  "reported",
  "pending",
]);
export const queueQuerySchema = z.object({
  filter: queueFilterSchema.default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce
    .number()
    .pipe(z.union([z.literal(12), z.literal(24), z.literal(48)]))
    .default(24),
});
export const queueEntrySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.string(),
  status: z.enum(["published", "pending_review", "archived"]),
  version: z.number().int(),
  unconfirmed: z.boolean(),
  missing: z.boolean(),
  stale: z.boolean(),
  reported: z.boolean(),
  pending: z.boolean(),
});
export const reviewQueueSchema = z.object({
  items: z.array(queueEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const privateReportSchema = z.object({
  id: z.uuid(),
  reason: reportReasonSchema,
  text: z.string(),
  status: z.enum(["open", "resolved", "dismissed"]),
  version: z.number().int(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolution: z.string(),
});
export const entryReportsSchema = z.object({
  listing: z.object({
    id: z.uuid(),
    name: z.string(),
    version: z.number().int(),
  }),
  items: z.array(privateReportSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const resolveReportSchema = z
  .object({
    version: z.number().int().positive(),
    listingVersion: z.number().int().positive(),
    outcome: z.enum(["resolved", "dismissed"]),
    resolution: z.string().trim().min(3).max(500),
  })
  .strict();
export type PrivateReport = z.infer<typeof privateReportSchema>;

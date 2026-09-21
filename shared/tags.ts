import { z } from "zod";
export const tagIconKeys = [
  "home",
  "book",
  "history",
  "people",
  "place",
  "meeting",
  "business",
  "work",
  "tools",
  "money",
  "exchange",
  "migration",
  "invitation",
  "calendar",
  "ballot",
  "organization",
  "thought",
  "discussion",
  "justice",
  "family",
  "art",
  "nature",
  "food",
  "sports",
  "health",
  "belief",
  "safety",
  "boat",
  "tech",
  "media",
  "web",
  "chat",
  "social",
  "video",
  "tag",
] as const;
export const tagDefinitionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  icon: z.enum(tagIconKeys),
  aliases: z.array(z.string()),
  retired: z.boolean(),
  mergedInto: z.uuid().nullable(),
  version: z.number().int(),
  count: z.number().int(),
});
export type TagDefinition = z.infer<typeof tagDefinitionSchema>;
export const tagCatalogResponse = z.object({
  items: z.array(tagDefinitionSchema),
});
export const tagEditSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.enum(tagIconKeys),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  retired: z.boolean().default(false),
  reason: z.string().trim().min(3).max(300),
});
export const tagSuggestionInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  reason: z.string().trim().min(3).max(500),
  listingName: z.string().trim().max(160).default(""),
});
export const tagSuggestionStatus = z.enum(["pending", "approved", "rejected"]);
export const tagSuggestionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  reason: z.string(),
  listingName: z.string(),
  status: tagSuggestionStatus,
  submittedBy: z.string().nullable(),
  submittedAt: z.string(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewReason: z.string(),
  approvedTagId: z.uuid().nullable(),
});
export const tagSuggestionsResponse = z.object({
  items: z.array(tagSuggestionSchema),
  page: z.number(),
  pageSize: z.number(),
});
export const tagSuggestionReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3).max(300),
});
export const tagSuggestionResponse = z.object({
  ok: z.literal(true),
  status: tagSuggestionStatus,
  approvedTagId: z.uuid().nullable(),
});

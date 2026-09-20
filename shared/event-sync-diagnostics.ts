import { z } from "zod";

export const skippedEventDiagnosticSchema = z.object({
  sourceEventId: z.string(),
  code: z.enum([
    "invalid_weekday",
    "invalid_recurrence",
    "unsupported_recurrence",
    "recurrence_limit",
    "unspecified",
  ]),
  reason: z.string(),
});
export type SkippedEventDiagnostic = z.infer<
  typeof skippedEventDiagnosticSchema
>;

// This contract belongs only on the authenticated administrator endpoint.
export const eventSyncDiagnosticsResponse = z.object({
  sources: z.array(
    z.object({
      sourceKey: z.string(),
      status: z.string(),
      lastCheckedAt: z.string().nullable(),
      lastFinishedAt: z.string().nullable(),
      diagnosticsAt: z.string().nullable(),
      skippedCount: z.number(),
      skipped: z.array(skippedEventDiagnosticSchema),
    }),
  ),
});

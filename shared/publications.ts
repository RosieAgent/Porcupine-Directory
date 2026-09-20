import { z } from "zod";

export const PORCUPINE_REPORT_ID = "f8d2630f-89af-4308-9117-9bc9a0ac9ccc";
export const REPORT_CHANNEL = "https://www.youtube.com/@FreeStateProjectNH";
export const REPORT_PLAYLIST =
  "https://www.youtube.com/playlist?list=PLDwk-SaLX7Ddd9QW9EvlymMvp0Y7gjNtJ";
export const REPORT_FEED = "https://anchor.fm/s/72228cd4/podcast/rss";
export const publicationSchema = z.object({
  title: z.string().min(1).max(300),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["podcasters.spotify.com", "creators.spotify.com", "anchor.fm"].includes(
        url.hostname,
      )
    );
  }),
  publishedAt: z.iso.datetime(),
});
export const publicationsResponse = z.object({
  items: z.array(publicationSchema).max(6),
  lastCheckedAt: z.iso.datetime().nullable(),
  lastSuccessfulAt: z.iso.datetime().nullable(),
  status: z.enum(["pending", "ok", "error", "disabled"]),
  pollIntervalMinutes: z.number().nullable(),
});

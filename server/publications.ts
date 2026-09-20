import { load } from "cheerio";
import { pool } from "./db.js";
import { publicationSchema, REPORT_FEED } from "../shared/publications.js";
import type { z } from "zod";

const KEY = "porcupine-report";
export const PUBLICATION_INTERVAL = 60 * 60 * 1000;
export const publicationsEnabled = () =>
  process.env.PUBLICATION_SYNC_ENABLED !== "false";

export function parsePublications(xml: string, now = Date.now()) {
  if (Buffer.byteLength(xml) > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Unsafe feed");
  const $ = load(xml, { xml: true });
  if (!$("rss > channel > title").text().includes("Porcupine Report"))
    throw new Error("Unexpected feed");
  const unique = new Map<string, z.infer<typeof publicationSchema>>();
  $("rss > channel > item").each((_, element) => {
    const item = $(element);
    const date = new Date(item.children("pubDate").text());
    if (!Number.isFinite(date.getTime()) || date.getTime() > now) return;
    const parsed = publicationSchema.safeParse({
      title: item.children("title").text().trim(),
      url: item.children("link").text().trim(),
      publishedAt: date.toISOString(),
    });
    if (parsed.success) unique.set(parsed.data.url, parsed.data);
  });
  const items = [...unique.values()]
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.url.localeCompare(b.url),
    )
    .slice(0, 6);
  if (!items.length) throw new Error("No usable publications");
  return items;
}

export async function fetchPublications() {
  // Only this reviewed publisher URL is fetched. No user-supplied URLs, redirects,
  // external entities, images, audio, or HTML from the feed reach the browser.
  const response = await fetch(REPORT_FEED, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/rss+xml, application/xml",
      "User-Agent": "PorcupineDirectory/0.1 public-feed-reader",
    },
  });
  if (!response.ok || !response.body) throw new Error("Feed unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2_000_000) throw new Error("Feed too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return parsePublications(Buffer.concat(chunks).toString("utf8"));
}

export async function syncPublications(fetcher = fetchPublications) {
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (
      await client.query("SELECT pg_try_advisory_lock(4350009) AS locked")
    ).rows[0].locked;
    if (!locked) return;
    await client.query(
      "INSERT INTO publication_feeds(source_key) VALUES ($1) ON CONFLICT DO NOTHING",
      [KEY],
    );
    const claimed = await client.query(
      `UPDATE publication_feeds SET last_checked_at=now()
      WHERE source_key=$1 AND (last_checked_at IS NULL OR last_checked_at < now() - interval '1 hour') RETURNING source_key`,
      [KEY],
    );
    if (!claimed.rowCount) return;
    try {
      const items = await fetcher();
      await client.query(
        "UPDATE publication_feeds SET items=$2,last_successful_at=now(),status='ok' WHERE source_key=$1",
        [KEY, JSON.stringify(items)],
      );
    } catch {
      // Retain the last successful result; do not confuse a fetch failure with inactivity.
      await client.query(
        "UPDATE publication_feeds SET status='error' WHERE source_key=$1",
        [KEY],
      );
    }
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(4350009)");
    client.release();
  }
}

export async function getPublications() {
  const { rows } = await pool.query(
    `SELECT items,last_checked_at AS "lastCheckedAt",
    last_successful_at AS "lastSuccessfulAt",status FROM publication_feeds WHERE source_key=$1`,
    [KEY],
  );
  return {
    ...(rows[0] ?? {
      items: [],
      lastCheckedAt: null,
      lastSuccessfulAt: null,
      status: "pending",
    }),
    ...(!publicationsEnabled() ? { status: "disabled" } : {}),
    pollIntervalMinutes: publicationsEnabled() ? 60 : null,
  };
}

export function startPublicationScheduler() {
  let stopped = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (stopped || running || !publicationsEnabled()) return;
    running = syncPublications()
      .catch(() => {
        console.error("Public publication sync unavailable");
      })
      .finally(() => {
        running = undefined;
      });
  };
  tick();
  const timer = setInterval(tick, 60_000);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}

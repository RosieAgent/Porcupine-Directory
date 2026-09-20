import { load } from "cheerio";
import { canonicalTags, syncPlatformTags } from "./tags.js";
import { pool } from "./db.js";
import { legacyConnections } from "../shared/connections.js";

export const DIRECTORY_URL =
  "https://docs.google.com/document/d/1Gwt7ttZPPgOq_oMCzVmQH9jPtiKA8ORONt9mgg-lBqc/edit";
export const DIRECTORY_EXPORT = DIRECTORY_URL.replace(
  /edit$/,
  "export?format=html",
);
const clean = (value: string) =>
  value
    .replace(/[\u200e\u200f\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const isEmpty = (value: string) =>
  !value || /^(?:_+|\?|unknown|unclaimed|not\s*provided)$/i.test(value);

export function safeUrl(input: string): string | null {
  try {
    let url = new URL(input);
    if (url.hostname === "www.google.com" && url.pathname === "/url") {
      url = new URL(
        url.searchParams.get("q") ?? url.searchParams.get("url") ?? "",
      );
    }
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function parseDirectory(html: string) {
  const $ = load(html);
  let section = "";
  let category = "";
  let finished = false;
  const entries: Array<{
    sourceId: string;
    name: string;
    summary: string;
    description: string;
    kind: string;
    tags: string[];
    access: string;
    instructions: string;
    links: Array<{ label: string; url: string }>;
    sourceUrl: string;
  }> = [];
  $("body")
    .children()
    .each((_, element) => {
      const el = $(element);
      const text = clean(el.text());
      if (element.tagName === "h1") {
        section = text;
        if (section === "Appendix") finished = true;
      }
      if (element.tagName === "h2") category = text;
      if (
        finished ||
        element.tagName !== "h3" ||
        /^(NEW ADD|Title)$/i.test(text)
      )
        return;
      const block = el.nextUntil("h1,h2,h3,h4");
      const lines = block.toArray().flatMap((e) => {
        const copy = $(e).clone();
        copy.find("br").replaceWith("\n");
        return copy.text().split("\n").map(clean).filter(Boolean);
      });
      const field = (name: string) =>
        lines
          .find((line) => new RegExp(`^${name}\\s*:`, "i").test(line))
          ?.replace(/^[^:]+:\s*/, "") ?? "";
      if (!lines.some((line) => /^Purpose\s*:/i.test(line))) return;
      const purpose = field("Purpose");
      const platform = field("Platform");
      const links: Array<{ label: string; url: string }> = [];
      block.find("a[href]").each((_, a) => {
        if (/^Owner\s*:/i.test(clean($(a).closest("p").text()))) return;
        const url = safeUrl($(a).attr("href") ?? "");
        if (
          url &&
          !url.startsWith(DIRECTORY_URL) &&
          !links.some((link) => link.url === url)
        ) {
          links.push({ label: clean($(a).text()) || "Source link", url });
        }
      });
      const rawLink = field("Link");
      const plainUrl =
        safeUrl(rawLink) ??
        (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(rawLink)
          ? safeUrl(`https://${rawLink}`)
          : null);
      if (plainUrl && !links.some((link) => link.url === plainUrl))
        links.push({ label: text, url: plainUrl });
      const linkIndex = lines.findIndex((line) => /^Link\s*:/i.test(line));
      const guidance =
        linkIndex < 0
          ? ""
          : lines
              .slice(linkIndex)
              .filter((line) => !/Table of Contents|^Owner\s*:/i.test(line))
              .join("\n")
              .replace(/^Link\s*:\s*/i, "");
      const invite =
        /\b(ask|dm|contact|vouch|request|contribute and ask)\b/i.test(guidance);
      const access = /\b(private|internal)\b/i.test(purpose)
        ? "private"
        : invite
          ? "invite_only"
          : "unknown";
      const kind = /Blogs\/vLogs|History/.test(category)
        ? "resource"
        : /Services/.test(category) &&
            !/\b(chat|group|discuss)\b/i.test(`${text} ${purpose}`)
          ? "business"
          : /Signal|Telegram|Discord|Facebook|\bX\b/i.test(platform) &&
              !/IRL/i.test(platform)
            ? "channel"
            : /\b(Web|Website|YouTube|Spotify)\b/i.test(platform)
              ? "resource"
              : "group";
      entries.push({
        sourceId: el.attr("id") ?? text.toLowerCase(),
        name: text,
        summary: isEmpty(purpose)
          ? `Listed under ${category}. A description has not yet been provided.`
          : purpose.slice(0, 280),
        description: [
          isEmpty(purpose) ? "" : purpose,
          isEmpty(platform) ? "" : `Platform: ${platform}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        kind,
        tags: [
          ...new Set(
            [section, category, ...platform.split(",").map(clean)].filter(
              (v) => !isEmpty(v),
            ),
          ),
        ],
        access,
        instructions: isEmpty(guidance)
          ? "Joining details have not been provided. Check the source document for updates."
          : `${guidance}\n\nAccess has not been independently verified. A listed link does not guarantee admission.`,
        links,
        sourceUrl: `${DIRECTORY_URL}#heading=${el.attr("id")}`,
      });
    });
  if (entries.length === 0)
    throw new Error("No directory entries found; refusing an empty import.");
  return entries;
}

export async function importDirectory(html?: string) {
  if (!html) {
    const response = await fetch(DIRECTORY_EXPORT, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Directory export returned ${response.status}`);
    html = await response.text();
  }
  const entries = parseDirectory(html);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.action','source-import',true),set_config('app.reason','porcupine_document',true)",
    );
    await client.query("SELECT pg_advisory_xact_lock(4350003)");
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    for (const e of entries) {
      const previous = await client.query(
        "SELECT connections,tags,locally_edited FROM listings WHERE source_key='porcupine_document' AND source_item_id=$1 FOR UPDATE",
        [e.sourceId],
      );
      if (previous.rows[0]?.locally_edited) continue;
      e.tags = await canonicalTags(
        client,
        e.kind === "business" ? [...new Set([...e.tags, "Business"])] : e.tags,
        previous.rows[0]?.tags ?? [],
      );
      const connections = legacyConnections(
        { links: e.links },
        previous.rows[0]?.connections ?? [],
      );
      e.tags = await syncPlatformTags(client, e.tags, connections);
      await client.query(
        `INSERT INTO listings
        (source_key, source_item_id, kind, name, summary, description, url, links, tags,
         access_mode, access_instructions, source_name, source_url, status, imported_at,connections)
        VALUES ('porcupine_document', $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          'The Porcupine Directory · Dennis Pratt', $11, 'published', NOW(),$12)
        ON CONFLICT (source_key, source_item_id) DO UPDATE SET
          name=EXCLUDED.name, summary=EXCLUDED.summary, description=EXCLUDED.description,
          url=EXCLUDED.url, links=EXCLUDED.links,connections=EXCLUDED.connections, tags=EXCLUDED.tags, kind=EXCLUDED.kind,
          access_mode=EXCLUDED.access_mode, access_instructions=EXCLUDED.access_instructions,
          source_url=EXCLUDED.source_url, imported_at=NOW(), updated_at=NOW()
        WHERE NOT listings.locally_edited AND
          ROW(listings.name,listings.summary,listings.description,listings.url,listings.links,listings.tags,listings.kind,listings.access_mode,listings.access_instructions,listings.source_url)
          IS DISTINCT FROM ROW(EXCLUDED.name,EXCLUDED.summary,EXCLUDED.description,EXCLUDED.url,EXCLUDED.links,EXCLUDED.tags,EXCLUDED.kind,EXCLUDED.access_mode,EXCLUDED.access_instructions,EXCLUDED.source_url)`,
        [
          e.sourceId,
          e.kind,
          e.name,
          e.summary,
          e.description,
          e.links[0]?.url ?? null,
          JSON.stringify(e.links),
          e.tags,
          e.access,
          e.instructions,
          e.sourceUrl,
          JSON.stringify(connections),
        ],
      );
    }
    await client.query(
      `INSERT INTO source_syncs
      (source_key, display_name, source_url, last_started_at, last_finished_at, last_status, item_count)
      VALUES ('porcupine_document', 'The Porcupine Directory · Dennis Pratt', $1, NOW(), NOW(), 'ok', $2)
      ON CONFLICT (source_key) DO UPDATE SET last_started_at=NOW(), last_finished_at=NOW(), last_status='ok', item_count=$2`,
      [DIRECTORY_URL, entries.length],
    );
    await client.query("COMMIT");
    return entries.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

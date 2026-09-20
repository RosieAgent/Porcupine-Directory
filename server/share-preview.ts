import type { RequestHandler } from "express";
import type { Pool } from "pg";
import { load } from "cheerio";
import { z } from "zod";

const siteName = "Porcupine Directory";
const genericDescription =
  "A privacy-respecting directory for New Hampshire communities, groups, businesses, and events.";
const publicPages = new Set([
  "/",
  "/directory",
  "/groups",
  "/channels",
  "/businesses",
  "/resources",
  "/organizations",
  "/events",
  "/events/calendar",
  "/tags",
  "/about",
  "/donate",
]);

type Preview = { title: string; description: string; canonical: string };
type Options = {
  indexHtml: string;
  origin: string;
  db: Pick<Pool, "query">;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function render(indexHtml: string, preview?: Preview, indexable = false) {
  const $ = load(indexHtml);
  // Replace defaults (and any previous preview), leaving the app shell/assets intact.
  $(
    "head title, head meta[name='description'], head meta[name='robots'], head meta[property^='og:'], head meta[name^='twitter:'], head link[rel='canonical']",
  ).remove();
  const title = escapeHtml(
    preview ? `${preview.title} · ${siteName}` : siteName,
  );
  const description = escapeHtml(preview?.description || genericDescription);
  $("head").append(
    `<title>${title}</title><meta name="description" content="${description}">`,
  );
  if (preview) {
    const url = escapeHtml(preview.canonical);
    $("head").append(
      `<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:site_name" content="${siteName}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}">`,
    );
  } else if (!indexable) {
    $("head").append('<meta name="robots" content="noindex, nofollow">');
  }
  return $.html();
}

/** SPA HTML fallback, mounted after API routes and static assets (index: false).
 * Uses only public projections, never sessions or request hosts/query strings.
 */
export function createSharePreviewHandler({
  indexHtml,
  origin,
  db,
}: Options): RequestHandler {
  const configured = new URL(origin);
  if (
    !["http:", "https:"].includes(configured.protocol) ||
    configured.username ||
    configured.password ||
    configured.search ||
    configured.hash ||
    configured.pathname !== "/"
  ) {
    throw new Error("Share previews require a configured HTTP(S) origin.");
  }
  const generic = render(indexHtml);
  const publicGeneric = render(indexHtml, undefined, true);
  return async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || !req.accepts("html")) {
      next();
      return;
    }
    let preview: Preview | undefined;
    const match = /^\/(listings|events)\/([^/]+)\/?$/.exec(req.path);
    if (match && z.uuid().safeParse(match[2]).success) {
      const [, kind, id] = match;
      try {
        const result = await db.query<{ title: string; description: string }>(
          kind === "listings"
            ? "SELECT name AS title, summary AS description FROM listings WHERE id=$1 AND status='published'"
            : "SELECT title, description FROM events WHERE id=$1 AND coalesce(raw_payload->>'hidden','false') <> 'true'",
          [id],
        );
        const row = result.rows[0];
        if (row)
          preview = {
            title: row.title.replace(/\s+/g, " ").trim().slice(0, 160),
            description: row.description
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 280),
            canonical: `${configured.origin}/${kind}/${id.toLowerCase()}`,
          };
      } catch {
        // A failed public lookup must not expose database errors or private data.
        res.status(503);
      }
    }
    res.set("Cache-Control", "no-store");
    const publicPage = publicPages.has(req.path);
    if (!preview && !publicPage) res.set("X-Robots-Tag", "noindex, nofollow");
    res
      .type("html")
      .send(
        preview
          ? render(indexHtml, preview)
          : publicPage
            ? publicGeneric
            : generic,
      );
  };
}

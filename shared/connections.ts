import { z } from "zod";
export const connectionTypes = [
  "website",
  "signal",
  "telegram",
  "discord",
  "facebook",
  "instagram",
  "youtube",
  "x",
  "nostr",
  "other",
] as const;
export type ConnectionType = (typeof connectionTypes)[number];
export const connectionLabels: Record<ConnectionType, string> = {
  website: "Website",
  signal: "Signal",
  telegram: "Telegram",
  discord: "Discord",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  nostr: "Nostr",
  other: "Other link",
};
export const webUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }, "Use an http or https link without embedded credentials.");
export const connectionSchema = z.object({
  id: z.uuid(),
  type: z.enum(connectionTypes),
  url: webUrl,
  label: z.string().trim().max(160).default(""),
  placement: z.enum(["auto", "primary", "additional"]).optional(),
});
export const connectionsSchema = z
  .array(connectionSchema)
  .max(30)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Connection IDs must be unique.",
  )
  .refine(
    (items) =>
      items.filter(
        (item) => item.type === "website" && item.placement === "primary",
      ).length <= 1,
    "Choose only one primary website; put other websites in Additional resources.",
  );
export type Connection = z.infer<typeof connectionSchema>;
// Presentation-only deduplication: keep stored links/IDs and audit history intact.
// Treat standard-port HTTP/HTTPS variants as one destination, preferring an
// already-supplied HTTPS link. Never strip queries, fragments, paths or www.
export function uniqueConnections(connections: Connection[]): Connection[] {
  const result: Connection[] = [];
  const seen = new Map<string, number>();
  for (const connection of connections) {
    if (!webUrl.safeParse(connection.url).success) continue;
    const url = new URL(connection.url);
    const secure = url.protocol === "https:";
    if (!url.port) url.protocol = "https:";
    const key = url.href;
    const index = seen.get(key);
    if (index === undefined) {
      seen.set(key, result.length);
      result.push(connection);
    } else if (secure && new URL(result[index].url).protocol === "http:") {
      result[index] = connection;
    }
  }
  return result;
}

export function connectionText(connection: Connection): string {
  const url = new URL(connection.url);
  if (
    connection.type === "website" &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash
  )
    return url.hostname.replace(/^www\./, "");
  return (
    connection.label ||
    (connection.type === "website"
      ? `${url.hostname}${url.pathname}`
      : connectionLabels[connection.type])
  );
}

// Public presentation only: keep all original connections available for editing
// and revisions. Never invent a homepage from an invite, subpage or short URL.
export function groupConnections(connections: Connection[]) {
  const links = uniqueConnections(connections);
  const homepage = (link: Connection) => {
    const url = new URL(link.url);
    return url.pathname === "/" && !url.search && !url.hash;
  };
  const website =
    links.find(
      (link) => link.type === "website" && link.placement === "primary",
    ) ??
    links.find(
      (link) =>
        link.type === "website" &&
        link.placement !== "additional" &&
        homepage(link),
    ) ??
    links.find(
      (link) => link.type === "website" && link.placement !== "additional",
    );
  const chosen = new Map<ConnectionType, string>();
  if (website) chosen.set("website", website.id);
  for (const type of connectionTypes.filter((type) => type !== "website")) {
    const candidates = links.filter(
      (link) => link.type === type && link.placement !== "additional",
    );
    const best =
      candidates.find((link) => link.placement === "primary") ??
      (type === "facebook"
        ? candidates.find(
            (link) => !/^\/groups(?:\/|$)/.test(new URL(link.url).pathname),
          )
        : undefined) ??
      candidates[0];
    if (best) chosen.set(type, best.id);
  }
  const primary: Connection[] = [],
    additional: Connection[] = [],
    omitted: Connection[] = [];
  for (const link of links) {
    if (link.placement === "additional") additional.push(link);
    else if (link.placement === "primary" || chosen.get(link.type) === link.id)
      primary.push(link);
    else if (
      link.type === "website" &&
      website &&
      homepage(website) &&
      new URL(link.url).host === new URL(website.url).host &&
      !new URL(link.url).search &&
      !new URL(link.url).hash
    )
      omitted.push(link);
    else additional.push(link);
  }
  return { primary, additional, omitted };
}
// Exact hosts only. Never fetch an invite or use substring matching on untrusted URLs.
export function classifyConnection(value: string): ConnectionType {
  if (!webUrl.safeParse(value).success) return "other";
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  const hosts: Record<string, ConnectionType> = {
    "signal.group": "signal",
    "signal.me": "signal",
    "t.me": "telegram",
    "telegram.me": "telegram",
    "web.telegram.org": "telegram",
    "x.com": "x",
    "twitter.com": "x",
    "discord.gg": "discord",
    "discord.com": "discord",
    "facebook.com": "facebook",
    "m.facebook.com": "facebook",
    "fb.me": "facebook",
    "instagram.com": "instagram",
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "njump.me": "nostr",
    "nostr.com": "nostr",
  };
  return hosts[host] ?? "website";
}
export function legacyConnections(
  entry: {
    url?: string | null;
    contact_url?: string | null;
    links?: { label: string; url: string }[];
  },
  previous: Connection[] = [],
): Connection[] {
  const links = [...(entry.links ?? [])];
  if (entry.url && !links.some((link) => link.url === entry.url))
    links.push({ label: "", url: entry.url });
  if (
    entry.contact_url &&
    !links.some((link) => link.url === entry.contact_url)
  )
    links.push({ label: "Contact", url: entry.contact_url });
  const used = new Set<string>();
  return links
    .filter((link) => webUrl.safeParse(link.url).success)
    .map((link) => {
      const id =
        previous.find(
          (item) =>
            item.url === link.url &&
            item.label === link.label &&
            !used.has(item.id),
        )?.id ??
        previous.find((item) => item.url === link.url && !used.has(item.id))
          ?.id ??
        crypto.randomUUID();
      used.add(id);
      return {
        id,
        type: classifyConnection(link.url),
        url: link.url,
        label: link.label.slice(0, 160),
        ...(previous.find((item) => item.id === id)?.placement
          ? { placement: previous.find((item) => item.id === id)!.placement }
          : {}),
      };
    })
    .filter(
      (item, index, all) =>
        all.findIndex(
          (other) => other.url === item.url && other.label === item.label,
        ) === index,
    );
}

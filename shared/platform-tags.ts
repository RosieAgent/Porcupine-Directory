import { classifyConnection, webUrl } from "./connections.js";

// These tags describe supplied destinations, never a platform mentioned in prose
// or a user-selected connection type. Do not fetch/expand URLs or join channels.
export const linkedPlatformTags = [
  "Facebook",
  "Telegram",
  "Slack",
  "Website",
] as const;
export function platformTagForUrl(value: string): string | undefined {
  if (!webUrl.safeParse(value).success) return undefined;
  const type = classifyConnection(value);
  if (type === "facebook") return "Facebook";
  if (type === "telegram") return "Telegram";
  const host = new URL(value).hostname.toLowerCase();
  if (host === "slack.com" || host.endsWith(".slack.com")) return "Slack";
  return undefined;
}

export function platformTagForConnection(link: {
  url: string;
  type?: string;
}): string | undefined {
  const platform = platformTagForUrl(link.url);
  if (platform) return platform;
  // Specific social/chat destinations are not generic websites. A reviewed
  // short link typed as a chat remains a chat without following redirects.
  if (
    webUrl.safeParse(link.url).success &&
    classifyConnection(link.url) === "website" &&
    (!link.type || link.type === "website" || link.type === "other")
  )
    return "Website";
  return undefined;
}

export function updatedSearch(
  current: URLSearchParams,
  changes: Record<string, string | undefined>,
) {
  const next = new URLSearchParams(current);
  if (!("page" in changes)) next.delete("page");
  for (const [key, value] of Object.entries(changes)) {
    if (!value || (key === "page" && value === "1")) next.delete(key);
    else next.set(key, value);
  }
  next.sort();
  return next;
}
export function safeExternalUrl(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function dateLabel(value: string, allDay = false) {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      ...(allDay ? {} : { timeStyle: "short" }),
    }).format(new Date(value)) + (allDay ? " · All day" : " · ET")
  );
}

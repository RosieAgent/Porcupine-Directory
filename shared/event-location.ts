import type { PublicEventLocation } from "./event-location-fields.js";
export type EventLocationInput = Pick<PublicEventLocation, "venue" | "city"> &
  Partial<Omit<PublicEventLocation, "venue" | "city">>;

export function eventLocation(event: EventLocationInput) {
  const { venue, address, city, state, postalCode, country, locationType } =
    event;
  if (locationType === "online")
    return {
      label: "Online · Check the source for joining details.",
      mapsUrl: null,
    };
  if (locationType === "undisclosed")
    return {
      label: "Location details are available from the organizer.",
      mapsUrl: null,
    };
  // A venue name may already contain its complete address in the source feed.
  const parts: string[] = [];
  for (const value of [venue, address, city, state, postalCode, country]) {
    const part = value?.trim();
    if (!part) continue;
    const words = (text: string) =>
      text
        .toLocaleLowerCase("en-US")
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .join(" ");
    if (
      !parts.some((existing) =>
        ` ${words(existing)} `.includes(` ${words(part)} `),
      )
    )
      parts.push(part);
  }
  const label = parts.join(", ");
  // An online meeting or an undisclosed location is not a map destination.
  const notPhysical =
    /\b(online|virtual|zoom|webinar|tbd|tba|undisclosed|private|restricted|to be (announced|determined)|location pending)\b|https?:\/\//i;
  if (!label || notPhysical.test(label)) return { label, mapsUrl: null };
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", label);
  return { label, mapsUrl: url.href.length <= 2048 ? url.href : null };
}

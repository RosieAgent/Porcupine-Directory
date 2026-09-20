import { load } from "cheerio";
import { DateTime } from "luxon";
import rrule from "rrule";
import { z } from "zod";
import { EVENT_TIMEZONE, eventSources } from "../shared/event-sources.js";
import type { PublicEventLocation } from "../shared/event-location-fields.js";
import type { SkippedEventDiagnostic } from "../shared/event-sync-diagnostics.js";

const { RRule } = rrule;
const API = "https://community.fsp.org/wp-json/stec/v5";
export const eventSchema = z.object({
  id: z.number(),
  status: z.string(),
  link: z.string().url(),
  title: z.object({ rendered: z.string() }),
  excerpt: z.object({
    rendered: z.string(),
    protected: z.boolean().optional(),
  }),
  stec_cal: z.array(z.number()),
  stec_loc: z.array(z.number()),
  meta: z.object({
    uid: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    timezone: z.string(),
    rrule: z.string(),
    exdate: z.array(z.string()),
    recurrence_id: z.string(),
    event_status: z.string(),
    read_permission: z.array(z.string()),
    approved: z.number(),
    all_day: z.boolean(),
  }),
});
type SourceEvent = z.infer<typeof eventSchema>;
type Calendar = { id: number; meta: { timezone: string } };
const plain = (html: string) => load(html).text().replace(/\s+/g, " ").trim();
const dayKey = (s: string) => s.replace(/[^\d]/g, "").slice(0, 8);

// Field names/types verified against the public STEC v5 locations endpoint.
// Never fall back to description, coordinates or a restricted location's name.
const locationSchema = z.object({
  name: z.string(),
  meta: z.object({
    read_permission: z.array(z.string()),
    protected: z.literal(false),
    type: z.string(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  }),
});
export function publicFspLocation(value: unknown): PublicEventLocation {
  const empty: PublicEventLocation = {
    venue: null,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    locationType: "unknown",
  };
  if (value === undefined) return empty;
  const parsed = locationSchema.safeParse(value);
  if (
    !parsed.success ||
    !parsed.data.meta.read_permission.includes("stec_public")
  )
    return { ...empty, locationType: "undisclosed" };
  const { name, meta } = parsed.data;
  // Virtual addresses can contain meeting credentials. Link only to the source.
  if (meta.type === "virtual") return { ...empty, locationType: "online" };
  if (meta.type !== "physical") return empty;
  const clean = (s: string | undefined) => (s ? plain(s) || null : null);
  return {
    venue: clean(name),
    address: clean(meta.address),
    city: clean(meta.city),
    state: clean(meta.state),
    postalCode: clean(meta.postal_code),
    country: clean(meta.country),
    locationType: "physical",
  };
}

class RecurrenceError extends Error {
  constructor(
    public code: SkippedEventDiagnostic["code"],
    reason: string,
  ) {
    super(reason);
  }
}

function recurrenceOptions(rule: string) {
  // Accept only documented RFC weekday tokens. In particular, S and T are
  // ambiguous; even unique-looking one-letter abbreviations are undocumented.
  const fields = rule.replace(/^RRULE:/, "").split(";");
  const seen = new Set<string>();
  for (const field of fields) {
    const [name, value, extra] = field.split("=");
    if (!value || extra !== undefined || seen.has(name))
      throw new RecurrenceError(
        "invalid_recurrence",
        "Malformed or duplicate recurrence field; source correction required.",
      );
    seen.add(name);
    if (
      name === "FREQ" &&
      !/^(YEARLY|MONTHLY|WEEKLY|DAILY|HOURLY|MINUTELY|SECONDLY)$/.test(value)
    )
      throw new RecurrenceError(
        "invalid_recurrence",
        "Unknown recurrence frequency; source correction required.",
      );
    if (name === "BYDAY" || name === "WKST") {
      const tokens = value.split(",");
      if (
        tokens.some(
          (token) =>
            !(
              name === "WKST"
                ? /^(MO|TU|WE|TH|FR|SA|SU)$/
                : /^(?:[+-]?(?:[1-9]|[1-4]\d|5[0-3]))?(MO|TU|WE|TH|FR|SA|SU)$/
            ).test(token),
        )
      )
        throw new RecurrenceError(
          "invalid_weekday",
          `${name}=${value.slice(0, 80)} is not a valid RFC weekday; source correction required (no inferred weekday).`,
        );
    }
    if (["COUNT", "INTERVAL"].includes(name) && !/^[1-9]\d{0,8}$/.test(value))
      throw new RecurrenceError(
        "invalid_recurrence",
        `${name} must be a positive bounded integer.`,
      );
  }
  if (!seen.has("FREQ") || (seen.has("COUNT") && seen.has("UNTIL")))
    throw new RecurrenceError(
      "invalid_recurrence",
      "Recurrence requires FREQ and cannot combine COUNT with UNTIL.",
    );
  const options = RRule.parseString(rule);
  if (
    options.freq === undefined ||
    options.freq > RRule.DAILY ||
    ["BYSECOND", "BYMINUTE", "BYHOUR"].some((field) => seen.has(field))
  )
    throw new RecurrenceError(
      "unsupported_recurrence",
      "Sub-daily recurrence is not supported.",
    );
  return options;
}

// Evaluate rules in wall-clock time, then convert with the calendar zone so
// a 6pm meetup stays at 6pm across daylight-saving transitions.
export function expandEvents(
  events: SourceEvent[],
  calendars: Calendar[],
  from: Date,
  to: Date,
  skipped: number[] = [],
  diagnostics: SkippedEventDiagnostic[] = [],
) {
  const exceptions = new Set(
    events
      .filter((e) => e.meta.recurrence_id)
      .map((e) => `${e.meta.uid}:${dayKey(e.meta.recurrence_id)}`),
  );
  const occurrences: Array<{
    key: string;
    title: string;
    description: string;
    startsAt: Date;
    endsAt: Date;
    url: string;
    locationId: number | undefined;
    allDay: boolean;
  }> = [];
  for (const event of events) {
    const m = event.meta;
    if (
      event.status !== "publish" ||
      m.approved !== 1 ||
      !m.read_permission.includes("stec_public") ||
      event.excerpt.protected ||
      m.event_status === "EventCancelled"
    )
      continue;
    const zone =
      m.timezone === "stec_cal_default"
        ? (calendars.find((c) => event.stec_cal.includes(c.id))?.meta
            .timezone ?? "America/New_York")
        : m.timezone;
    const start = DateTime.fromISO(m.start_date, { zone });
    const end = DateTime.fromISO(m.end_date, { zone });
    if (!start.isValid || !end.isValid || end < start)
      throw new Error(`Invalid dates for FSP event ${event.id}`);
    const wallStart = start.setZone("UTC", { keepLocalTime: true });
    const wallEnd = end.setZone("UTC", { keepLocalTime: true });
    const duration = wallEnd.toMillis() - wallStart.toMillis();
    const dates = [wallStart.toJSDate()];
    if (m.rrule && !m.recurrence_id) {
      const rule = m.rrule
        .replace(/;+$/, "")
        .replace(/UNTIL=(\d{8})(?=;|$)/, "UNTIL=$1T235959Z");
      try {
        const options = recurrenceOptions(rule);
        // RFC UTC UNTIL is an instant; compare it in the same wall-clock basis
        // as DTSTART. A source date-only UNTIL retains its inclusive local day.
        if (options.until && /UNTIL=\d{8}T\d{6}Z(?:;|$)/.test(m.rrule))
          options.until = DateTime.fromJSDate(options.until, { zone })
            .setZone("UTC", { keepLocalTime: true })
            .toJSDate();
        let count = 0;
        dates.push(
          ...new RRule({ ...options, dtstart: wallStart.toJSDate() }).between(
            new Date(from.getTime() - duration - 86400000),
            new Date(to.getTime() + 86400000),
            true,
            () => {
              if (++count > 5000)
                throw new RecurrenceError(
                  "recurrence_limit",
                  "Recurrence exceeds 5,000 occurrences in the import window.",
                );
              return true;
            },
          ),
        );
      } catch (error) {
        skipped.push(event.id);
        diagnostics.push({
          sourceEventId: String(event.id),
          code:
            error instanceof RecurrenceError
              ? error.code
              : "invalid_recurrence",
          reason:
            error instanceof RecurrenceError
              ? error.message
              : "Recurrence could not be parsed; source correction required.",
        });
        continue;
      }
    }
    for (const date of [
      ...new Map(dates.map((d) => [d.toISOString(), d])).values(),
    ]) {
      const key = dayKey(date.toISOString());
      if (
        !m.recurrence_id &&
        (m.exdate.some((d) => dayKey(d) === key) ||
          exceptions.has(`${m.uid}:${key}`))
      )
        continue;
      const occurrence = DateTime.fromJSDate(date, { zone: "UTC" }).setZone(
        zone,
        { keepLocalTime: true },
      );
      const occurrenceEnd = DateTime.fromMillis(date.getTime() + duration, {
        zone: "UTC",
      }).setZone(zone, { keepLocalTime: true });
      if (
        occurrenceEnd.toMillis() < from.getTime() ||
        occurrence.toMillis() > to.getTime()
      )
        continue;
      occurrences.push({
        key: `${event.id}:${date.toISOString()}`,
        title: plain(event.title.rendered),
        description: plain(event.excerpt.rendered),
        startsAt: occurrence.toJSDate(),
        endsAt: occurrenceEnd.toJSDate(),
        url: event.link,
        locationId: event.stec_loc[0],
        allDay: m.all_day,
      });
    }
  }
  return occurrences;
}

export async function getAll(
  path: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const items: unknown[] = [];
  let expectedTotal: number | undefined;
  for (let page = 1; page <= 50; page++) {
    const url = new URL(`${API}/${path}`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const response = await fetcher(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    if (!response.ok)
      throw new Error(`FSP ${path} returned ${response.status}`);
    const batch: unknown = await response.json();
    if (!Array.isArray(batch))
      throw new Error(`Unexpected FSP ${path} response`);
    items.push(...batch);
    const totalHeader = response.headers.get("x-wp-total");
    if (totalHeader !== null) {
      const total = Number(totalHeader);
      if (
        !Number.isSafeInteger(total) ||
        total < 0 ||
        (expectedTotal !== undefined && expectedTotal !== total)
      )
        throw new Error(
          "FSP pagination changed during the check; keeping previous events.",
        );
      expectedTotal = total;
    }
    const pages = Number(response.headers.get("x-wp-totalpages"));
    if (pages > 0 ? page >= pages : batch.length < 100) {
      if (expectedTotal !== undefined && items.length !== expectedTotal)
        throw new Error("Incomplete FSP snapshot; keeping previous events.");
      return items;
    }
  }
  throw new Error("FSP pagination exceeded limit; keeping previous events.");
}

export async function fetchFspSnapshot(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(eventSources.fsp_calendar.url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok)
    throw new Error(`FSP calendar page returned ${response.status}`);
  const html = await response.text();
  const calendarIds = html
    .match(/"filter__calendar":"([\d,]+)"/)?.[1]
    .split(",")
    .map(Number);
  if (!calendarIds?.length)
    throw new Error(
      "Cannot identify public calendar selection; keeping previous events.",
    );
  const [rawEvents, rawCalendars, rawLocations] = await Promise.all([
    getAll(
      `events?stec_cal=${calendarIds.join(",")}&context=view`,
      signal,
      fetcher,
    ),
    getAll("calendars", signal, fetcher),
    getAll("locations", signal, fetcher),
  ]);
  const calendars = z
    .array(
      z.object({ id: z.number(), meta: z.object({ timezone: z.string() }) }),
    )
    .parse(rawCalendars);
  const locations = new Map(
    rawLocations.map((value) => {
      const { id } = z.object({ id: z.number() }).parse(value);
      return [id, publicFspLocation(value)] as const;
    }),
  );
  const events = z.array(eventSchema).parse(rawEvents);
  if (!events.length)
    throw new Error("Empty FSP event response; keeping previous events.");
  const now = DateTime.now().setZone(EVENT_TIMEZONE);
  // Include the current month and its leading days for the month grid.
  const from = now.startOf("month").minus({ days: 7 }).toJSDate();
  const to = now.plus({ days: 90 }).endOf("day").toJSDate();
  const skipped: number[] = [];
  const diagnostics: SkippedEventDiagnostic[] = [];
  const occurrences = expandEvents(
    events,
    calendars,
    from,
    to,
    skipped,
    diagnostics,
  );
  return {
    from,
    to,
    skipped: skipped.map(String),
    diagnostics,
    events: occurrences.map((e) => ({
      ...e,
      ...(e.locationId === undefined
        ? publicFspLocation(undefined)
        : (locations.get(e.locationId) ?? publicFspLocation(undefined))),
    })),
  };
}

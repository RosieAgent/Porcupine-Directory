import test from "node:test";
import assert from "node:assert/strict";
import { isPollDue, saveSnapshot } from "../dist-server/server/event-sync.js";
import { getAll } from "../dist-server/server/fsp.js";
import { calendarQuerySchema } from "../dist-server/shared/contracts.js";
import {
  calendarRange,
  toCalendarEvent,
} from "../dist-server/shared/calendar.js";

test("hourly schedule is restart-safe and retries failures on the same bounded cadence", () => {
  const now = new Date("2026-09-18T12:00:00Z");
  assert.equal(isPollDue(null, now), true);
  assert.equal(isPollDue(new Date("2026-09-18T11:00:00Z"), now), true);
  assert.equal(isPollDue(new Date("2026-09-18T11:00:01Z"), now), false);
});
test("calendar range is six Sunday-starting weeks, with timezone-aware DST", () => {
  assert.equal(
    calendarQuerySchema.safeParse({ month: "2026-13" }).success,
    false,
  );
  const range = calendarRange("2026-11");
  assert.equal(range.from.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-12-13T05:00:00.000Z");
  const event = toCalendarEvent({
    id: "example",
    title: "Two days",
    allDay: true,
    startsAt: "2026-09-05T04:00:00Z",
    endsAt: "2026-09-07T03:59:00Z",
  });
  assert.equal(event.start, "2026-09-05");
  assert.equal(event.end, "2026-09-07");
  assert.equal(event.url, "/events/example");
});
test("FSP pagination reads every advertised page even if a batch is short", async () => {
  const pages = [];
  const result = await getAll(
    "events",
    new AbortController().signal,
    async (url) => {
      const page = Number(url.searchParams.get("page"));
      pages.push(page);
      return new Response(JSON.stringify([{ id: page }]), {
        headers: { "x-wp-totalpages": "2", "x-wp-total": "2" },
      });
    },
  );
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.length, 2);
});
test("HTTP errors and incomplete snapshots cannot pass validation", async () => {
  await assert.rejects(
    () =>
      getAll(
        "events",
        new AbortController().signal,
        async () => new Response("", { status: 503 }),
      ),
    /503/,
  );
  await assert.rejects(
    () =>
      getAll(
        "events",
        new AbortController().signal,
        async () =>
          new Response("[]", {
            headers: { "x-wp-totalpages": "1", "x-wp-total": "5" },
          }),
      ),
    /Incomplete/,
  );
});

test("snapshot persistence carries structured location and diagnostic reasons without losing skipped IDs", async () => {
  const queries = [];
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const diagnostic = {
    sourceEventId: "6147",
    code: "invalid_weekday",
    reason: "BYDAY=3S requires source correction.",
  };
  await saveSnapshot(client, "fsp_calendar", {
    from: new Date("2026-09-01"),
    to: new Date("2026-12-01"),
    skipped: ["6147", "6058"],
    diagnostics: [diagnostic],
    events: [
      {
        key: "1:date",
        title: "Event",
        description: "Public",
        startsAt: new Date("2026-10-01"),
        endsAt: new Date("2026-10-02"),
        venue: "Hall",
        city: "Concord",
        address: "10 Main St",
        state: "NH",
        postalCode: "03301",
        country: "USA",
        locationType: "physical",
        url: "https://example.org",
        allDay: false,
      },
    ],
  });
  assert.deepEqual(queries[0].params.slice(9), [
    "Concord",
    "10 Main St",
    "NH",
    "03301",
    "USA",
    "physical",
    true,
  ]);
  assert.deepEqual(queries[1].params[4], ["6147", "6058"]);
  const saved = JSON.parse(queries[2].params[6]);
  assert.deepEqual(saved[0], diagnostic);
  assert.equal(saved[1].sourceEventId, "6058");
  assert.equal(saved[1].code, "unspecified");
});

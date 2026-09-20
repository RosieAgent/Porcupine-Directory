import test from "node:test";
import assert from "node:assert/strict";
import {
  expandEvents,
  publicFspLocation,
  fetchFspSnapshot,
} from "../dist-server/server/fsp.js";

const event = (rule, extra = {}) => ({
  id: 1,
  status: "publish",
  link: "https://example.org/event",
  title: { rendered: "Public event" },
  excerpt: { rendered: "Public description" },
  stec_cal: [1],
  stec_loc: [2],
  meta: {
    uid: "series",
    start_date: "2026-10-25T18:00",
    end_date: "2026-10-25T19:00",
    timezone: "America/New_York",
    rrule: rule,
    exdate: [],
    recurrence_id: "",
    event_status: "EventScheduled",
    read_permission: ["stec_public"],
    approved: 1,
    all_day: false,
  },
  ...extra,
});
const from = new Date("2026-10-24T00:00Z");
const to = new Date("2026-11-12T00:00Z");

// Public source IDs and BYDAY values observed in all 20 skipped FSP series.
// Evidence: GET https://community.fsp.org/wp-json/stec/v5/events?stec_cal=24,45,49,61,68,130,131,132,133,134,1026,1503,1759&context=view
// All 411 events were paginated; the selected calendar IDs came from /calendar/.
// RFC 5545 section 3.3.10 requires MO/TU/WE/TH/FR/SA/SU. No one-letter repair.
const observedWeekdays = [
  [6147, "3S"],
  [6058, "2F"],
  [6057, "2F"],
  [6044, "2T"],
  [6039, "2T"],
  [6038, "2T"],
  [6035, "2W"],
  [5779, "3S"],
  [5778, "2S"],
  [5777, "-1S"],
  [5776, "1S"],
  [5775, "-1F"],
  [5771, "2W"],
  [5759, "W"],
  [5752, "4W"],
  [5746, "3F"],
  [5743, "3W"],
  [5742, "3W"],
  [5741, "1S"],
  [4713, "3F"],
];
test("all observed one-letter weekdays remain skipped with actionable IDs and reasons", () => {
  const skipped = [],
    diagnostics = [];
  const rows = expandEvents(
    observedWeekdays.map(([id, token]) =>
      event(`FREQ=${id === 5759 ? "WEEKLY" : "MONTHLY"};BYDAY=${token}`, {
        id,
      }),
    ),
    [],
    from,
    to,
    skipped,
    diagnostics,
  );
  assert.equal(rows.length, 0);
  assert.deepEqual(
    skipped,
    observedWeekdays.map(([id]) => id),
  );
  assert.deepEqual(
    diagnostics.map((d) => d.sourceEventId),
    skipped.map(String),
  );
  diagnostics.forEach((d, index) => {
    assert.equal(d.code, "invalid_weekday");
    assert.ok(d.reason.includes(`BYDAY=${observedWeekdays[index][1]}`));
    assert.match(d.reason, /source correction/);
  });
});
test("standard weekday rules preserve DST, exclusions, and inclusive date-only UNTIL", () => {
  const source = event("RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20261108;");
  source.meta.exdate = ["20261101"];
  const rows = expandEvents([source], [], from, to);
  assert.deepEqual(
    rows.map((row) => row.startsAt.toISOString()),
    ["2026-10-25T22:00:00.000Z", "2026-11-08T23:00:00.000Z"],
  );
});
test("UTC UNTIL compares real instants across DST instead of accepting a later local time", () => {
  const rows = expandEvents(
    [event("FREQ=WEEKLY;UNTIL=20261108T220000Z")],
    [],
    from,
    to,
  );
  assert.deepEqual(
    rows.map((row) => row.startsAt.toISOString()),
    ["2026-10-25T22:00:00.000Z", "2026-11-01T23:00:00.000Z"],
  );
  assert.equal(
    expandEvents([event("FREQ=WEEKLY;UNTIL=20261108T230000Z")], [], from, to)
      .length,
    3,
  );
});
test("standard ordinal weekdays remain supported without changing their meaning", () => {
  const rows = expandEvents(
    [event("FREQ=MONTHLY;BYDAY=-1SU;COUNT=2")],
    [],
    from,
    new Date("2026-12-01"),
  );
  assert.deepEqual(
    rows.map((row) => row.startsAt.toISOString()),
    ["2026-10-25T22:00:00.000Z", "2026-11-29T23:00:00.000Z"],
  );
});
test("missing frequency, duplicate fields, invalid weekdays and sub-daily rules have stable reasons", () => {
  for (const [rule, code] of [
    ["BYDAY=MO", "invalid_recurrence"],
    ["FREQ=WEEKLY;COUNT=0", "invalid_recurrence"],
    ["FREQ=WEEKLY;INTERVAL=0", "invalid_recurrence"],
    ["FREQ=WEEKLY;COUNT=2;COUNT=3", "invalid_recurrence"],
    ["FREQ=WEEKLY;COUNT=2;UNTIL=20261108", "invalid_recurrence"],
    ["FREQ=WEEKLY;BYDAY=0MO", "invalid_weekday"],
    ["FREQ=WEEKLY;WKST=S", "invalid_weekday"],
    ["FREQ=HOURLY", "unsupported_recurrence"],
    ["FREQ=DAILY;BYHOUR=1,2", "unsupported_recurrence"],
    ["FREQ=NOPE", "invalid_recurrence"],
  ]) {
    const diagnostics = [],
      skipped = [];
    assert.equal(
      expandEvents([event(rule)], [], from, to, skipped, diagnostics).length,
      0,
      rule,
    );
    assert.deepEqual(skipped, [1], rule);
    assert.equal(diagnostics[0].code, code, rule);
  }
});
test("protected and restricted events never contribute diagnostic contents", () => {
  const privateEvent = event("FREQ=WEEKLY;BYDAY=S", { id: 2 });
  privateEvent.meta.read_permission = ["stec_private"];
  const diagnostics = [],
    skipped = [];
  assert.equal(
    expandEvents(
      [
        privateEvent,
        event("FREQ=WEEKLY;BYDAY=S", {
          excerpt: { rendered: "Secret", protected: true },
        }),
      ],
      [],
      from,
      to,
      skipped,
      diagnostics,
    ).length,
    0,
  );
  assert.deepEqual(skipped, []);
  assert.deepEqual(diagnostics, []);
});

const physical = {
  id: 2,
  name: "Hall &amp; café",
  description: "Not an address source",
  meta: {
    read_permission: ["stec_public"],
    protected: false,
    type: "physical",
    address: "10 Main St",
    city: "Concord",
    state: "NH",
    postal_code: "03301",
    country: "USA",
    coordinates: "Not imported",
  },
};
test("public physical locations import only verified structured text fields", () => {
  assert.deepEqual(publicFspLocation(physical), {
    venue: "Hall & café",
    address: "10 Main St",
    city: "Concord",
    state: "NH",
    postalCode: "03301",
    country: "USA",
    locationType: "physical",
  });
});
test("restricted, protected and unverifiable locations never expose name or address", () => {
  for (const meta of [
    { ...physical.meta, protected: true },
    { ...physical.meta, protected: undefined },
    { ...physical.meta, read_permission: ["stec_private"] },
    { ...physical.meta, read_permission: [] },
    undefined,
  ]) {
    const result = publicFspLocation({ ...physical, meta });
    assert.equal(result.locationType, "undisclosed");
    for (const [key, value] of Object.entries(result))
      if (key !== "locationType") assert.equal(value, null);
  }
});
test("virtual locations expose an online state without meeting addresses or credentials", () => {
  const result = publicFspLocation({
    ...physical,
    name: "Private joining code",
    meta: {
      ...physical.meta,
      type: "virtual",
      address: "https://example.org/meeting?password=secret",
    },
  });
  assert.equal(result.locationType, "online");
  for (const [key, value] of Object.entries(result))
    if (key !== "locationType") assert.equal(value, null);
  assert.equal(publicFspLocation(undefined).locationType, "unknown");
  assert.equal(
    publicFspLocation({
      ...physical,
      meta: { ...physical.meta, type: "unrecognized" },
    }).locationType,
    "unknown",
  );
});

test("complete snapshot joins sanitized locations and emits diagnostics without retaining raw source data", async () => {
  const day = new Date().toISOString().slice(0, 10);
  const sourceEvents = [2, 3, 4, 999].map((location, index) => {
    const source = event("", { id: index + 1, stec_loc: [location] });
    source.meta.start_date = `${day}T18:00`;
    source.meta.end_date = `${day}T19:00`;
    return source;
  });
  sourceEvents.push(event("FREQ=WEEKLY;BYDAY=S", { id: 5 }));
  sourceEvents.push(
    event("FREQ=WEEKLY;BYDAY=S", {
      id: 6,
      excerpt: { rendered: "Secret", protected: true },
    }),
  );
  const locations = [
    physical,
    {
      ...physical,
      id: 3,
      name: "Secret name",
      meta: { ...physical.meta, protected: true, address: "Secret address" },
    },
    {
      ...physical,
      id: 4,
      meta: {
        ...physical.meta,
        type: "virtual",
        address: "https://example.org/secret",
      },
    },
  ];
  const snapshot = await fetchFspSnapshot(
    new AbortController().signal,
    async (input) => {
      const url = new URL(input);
      if (url.pathname === "/calendar/")
        return new Response('"filter__calendar":"1"');
      let rows;
      if (url.pathname.endsWith("/events")) {
        assert.equal(url.searchParams.get("stec_cal"), "1");
        assert.equal(url.searchParams.get("context"), "view");
        rows = sourceEvents;
      } else if (url.pathname.endsWith("/calendars"))
        rows = [{ id: 1, meta: { timezone: "America/New_York" } }];
      else if (url.pathname.endsWith("/locations")) rows = locations;
      else throw Error(`Unexpected test URL ${url.pathname}`);
      return new Response(JSON.stringify(rows), {
        headers: { "x-wp-totalpages": "1", "x-wp-total": String(rows.length) },
      });
    },
  );
  assert.deepEqual(
    snapshot.events.map((row) => row.locationType),
    ["physical", "undisclosed", "online", "unknown"],
  );
  assert.equal(snapshot.events[0].address, "10 Main St");
  assert.equal(snapshot.events[0].city, "Concord");
  assert.deepEqual(snapshot.skipped, ["5"]);
  assert.equal(snapshot.diagnostics[0].code, "invalid_weekday");
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /Secret|example.org\/secret|coordinates|read_permission/,
  );
});

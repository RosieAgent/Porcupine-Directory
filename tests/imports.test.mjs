import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDirectory,
  safeUrl,
} from "../dist-server/server/directory-import.js";
import { expandEvents } from "../dist-server/server/fsp.js";

test("directory import skips templates and appendix; preserves guidance and multiple links", () => {
  const rows =
    parseDirectory(`<body><h1>Social Groups</h1><h2>Regional Groups</h2>
    <h3 id="one">Example group</h3><p>Purpose: Meet neighbors</p><p>Platform: Signal</p>
    <p>Owner: Not a person profile</p><p>Link: Ask a member<br>
      <a href="https://www.google.com/url?q=https%3A%2F%2Fexample.org%2Fjoin">Join</a>
      <a href="https://example.org/about">About</a><a href="javascript:alert(1)">Bad</a></p>
    <h3>NEW ADD</h3><p>Purpose: __</p><h1>Appendix</h1><h3>Template</h3><p>Purpose: __</p></body>`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].access, "invite_only");
  assert.equal(rows[0].links.length, 2);
  assert.equal(rows[0].links[0].url, "https://example.org/join");
  assert.ok(!rows[0].description.includes("Not a person profile"));
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.throws(
    () => parseDirectory("<html>Sign in</html>"),
    /No directory entries/,
  );
});

const event = (meta = {}, extra = {}) => ({
  id: 1,
  status: "publish",
  link: "https://example.org/event",
  title: { rendered: "Local &amp; friendly" },
  excerpt: { rendered: "<p>Meetup</p>" },
  stec_cal: [1],
  stec_loc: [],
  meta: {
    uid: "weekly",
    start_date: "2026-10-25T18:00",
    end_date: "2026-10-25T19:00",
    timezone: "America/New_York",
    rrule: "FREQ=WEEKLY;COUNT=3;",
    exdate: [],
    recurrence_id: "",
    event_status: "EventScheduled",
    read_permission: ["stec_public"],
    approved: 1,
    all_day: false,
    ...meta,
  },
  ...extra,
});
const from = new Date("2026-10-24T00:00Z");
const to = new Date("2026-11-12T00:00Z");

test("recurring local time survives DST and does not duplicate DTSTART", () => {
  const rows = expandEvents([event()], [], from, to);
  assert.deepEqual(
    rows.map((e) => e.startsAt.toISOString()),
    [
      "2026-10-25T22:00:00.000Z",
      "2026-11-01T23:00:00.000Z",
      "2026-11-08T23:00:00.000Z",
    ],
  );
  assert.equal(rows[0].title, "Local & friendly");
});

test("exceptions, moved occurrences, cancellations, and private events are respected", () => {
  const master = event({ exdate: ["2026-11-08T00:00"] });
  const moved = event(
    {
      recurrence_id: "20261101",
      rrule: "",
      start_date: "2026-11-02T19:00",
      end_date: "2026-11-02T20:00",
    },
    { id: 2 },
  );
  const rows = expandEvents(
    [master, moved, event({ read_permission: ["stec_private"] }, { id: 3 })],
    [],
    from,
    to,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[1].startsAt.toISOString(), "2026-11-03T00:00:00.000Z");
  const cancelled = event(
    { recurrence_id: "20261101", rrule: "", event_status: "EventCancelled" },
    { id: 2 },
  );
  assert.equal(expandEvents([master, cancelled], [], from, to).length, 1);
});

test("ambiguous broken source rules are reported, never guessed", () => {
  const skipped = [];
  const rows = expandEvents(
    [event({ rrule: "FREQ=MONTHLY;BYDAY=3S" })],
    [],
    from,
    to,
    skipped,
  );
  assert.equal(rows.length, 0);
  assert.deepEqual(skipped, [1]);
});

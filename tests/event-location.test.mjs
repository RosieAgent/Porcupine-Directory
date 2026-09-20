import assert from "node:assert/strict";
import test from "node:test";
import { eventLocation } from "../dist-server/shared/event-location.js";

const location = eventLocation({
  venue: "  Café & Hall, 10 Main St  ",
  city: "Concord, NH",
});
const url = new URL(location.mapsUrl);
assert.equal(url.origin, "https://www.google.com");
assert.equal(url.pathname, "/maps/search/");
assert.equal(url.searchParams.get("api"), "1");
assert.equal(
  url.searchParams.get("query"),
  "Café & Hall, 10 Main St, Concord, NH",
);
assert.equal([...url.searchParams].length, 2);
assert.ok(eventLocation({ venue: null, city: "Concord, NH" }).mapsUrl);
for (const venue of [
  null,
  "  ",
  "Online",
  "Virtual meeting",
  "Zoom",
  "Location TBD",
  "To be announced",
  "https://example.org/meeting",
]) {
  assert.equal(eventLocation({ venue, city: null }).mapsUrl, null);
}
assert.equal(
  eventLocation({ venue: "a".repeat(2100), city: null }).mapsUrl,
  null,
);

test("structured address and region disambiguate a map search without duplicate text", () => {
  const result = eventLocation({
    venue: "Town Hall, 10 Main St, Concord, NH 03301, USA",
    address: "10 Main St",
    city: "Concord",
    state: "NH",
    postalCode: "03301",
    country: "USA",
    locationType: "physical",
  });
  assert.equal(result.label, "Town Hall, 10 Main St, Concord, NH 03301, USA");
  assert.equal(new URL(result.mapsUrl).searchParams.get("query"), result.label);
  assert.equal(
    eventLocation({
      venue: "Hall",
      address: "10 Main St",
      city: "Concord",
      state: "NH",
    }).label,
    "Hall, 10 Main St, Concord, NH",
  );
});
test("structured online and undisclosed states cannot leak stale physical fields into a map", () => {
  for (const locationType of ["online", "undisclosed"]) {
    const result = eventLocation({
      venue: "Secret venue",
      address: "Secret address",
      city: "Secret city",
      locationType,
    });
    assert.equal(result.mapsUrl, null);
    assert.ok(!result.label.includes("Secret"));
  }
  assert.match(
    eventLocation({ venue: null, city: null, locationType: "online" }).label,
    /Online/,
  );
});
test("address-only physical locations map; private or unresolved text never does", () => {
  assert.ok(
    eventLocation({
      venue: null,
      city: null,
      address: "10 Main St, Concord, NH",
      locationType: "physical",
    }).mapsUrl,
  );
  for (const venue of ["Private residence", "Restricted", "Location TBD"])
    assert.equal(
      eventLocation({ venue, city: "Concord", address: "10 Main St" }).mapsUrl,
      null,
    );
});

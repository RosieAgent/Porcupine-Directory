import test from "node:test";
import assert from "node:assert/strict";
import {
  locationOptions,
  findLocation,
  normalizeLocation,
  locationChoices,
  locationMatchKey,
} from "../dist-server/shared/locations.js";
import {
  submissionSchema,
  lifecycleLabels,
} from "../dist-server/shared/contracts.js";

test("NH locations use stable catalog choices and case-insensitive town aliases", () => {
  assert.equal(
    locationOptions.filter((item) => item.id.startsWith("nh-dot-")).length,
    259,
  );
  assert.equal(
    new Set(locationOptions.map((item) => item.id)).size,
    locationOptions.length,
  );
  for (const value of [
    "concord",
    "CONCORD",
    " Concord, nh ",
    "Concord New Hampshire",
  ])
    assert.equal(normalizeLocation(value), "Concord, NH");
  assert.equal(normalizeLocation("NH"), "New Hampshire");
  assert.equal(normalizeLocation("new hampshire"), "New Hampshire");
  assert.equal(normalizeLocation("seacoast"), "Seacoast, NH");
  assert.equal(findLocation("Concrodd"), undefined);
  assert.equal(findLocation("Hillsborough County")?.group, "Counties");
  assert.equal(findLocation("Hillsborough")?.group, "Towns, cities & places");
  assert.equal(
    locationMatchKey("Manchester, NH"),
    locationMatchKey("manchester"),
  );
  const choices = locationChoices([
    "concord",
    "CONCORD, NH",
    "Legacy Village",
    "legacy village",
  ]);
  assert.equal(choices.length, locationOptions.length + 1);
  assert.equal(
    submissionSchema.parse({
      kind: "group",
      name: "Test group",
      summary: "Test description",
      location: "concord",
    }).location,
    "Concord, NH",
  );
  assert.equal(lifecycleLabels.unknown, "Not sure yet");
});

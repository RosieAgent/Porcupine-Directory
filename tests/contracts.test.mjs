import test from "node:test";
import assert from "node:assert/strict";
import {
  listingQuerySchema,
  eventQuerySchema,
  submissionSchema,
} from "../dist-server/shared/contracts.js";
test("paging and filters validate query strings and reject unbounded or malformed inputs", () => {
  assert.equal(listingQuerySchema.parse({}).pageSize, 25);
  assert.equal(
    listingQuerySchema.parse({
      page: "2",
      pageSize: "24",
      access: "invite_only",
    }).page,
    2,
  );
  for (const input of [
    { page: "0" },
    { page: "NaN" },
    { pageSize: "10000" },
    { kind: "people" },
    { q: ["a", "b"] },
  ]) {
    assert.equal(listingQuerySchema.safeParse(input).success, false);
  }
  assert.equal(
    eventQuerySchema.safeParse({ from: "2026-02-31" }).success,
    false,
  );
  assert.equal(
    eventQuerySchema.safeParse({ from: "2026-10-10", to: "2026-10-01" })
      .success,
    false,
  );
});
test("contributions cannot use executable links or publish themselves", () => {
  const input = {
    kind: "group",
    name: "Example group",
    summary: "Meet friendly neighbors.",
    status: "published",
  };
  assert.equal(
    submissionSchema.safeParse({ ...input, url: "javascript:alert(1)" })
      .success,
    false,
  );
  assert.equal("status" in submissionSchema.parse(input), false);
});

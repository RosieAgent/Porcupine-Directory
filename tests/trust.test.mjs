import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmationPriority,
  isFreshConfirmation,
  CONFIRMATION_FRESH_MS,
  confirmationDate,
} from "../dist-server/shared/trust.js";
import {
  listingQuerySchema,
  submissionSchema,
} from "../dist-server/shared/contracts.js";
const now = Date.parse("2026-09-19T01:44:06Z");
const fresh = new Date(now - 1000).toISOString();
test("confirmation tiers and expiry are deterministic, not popularity scores", () => {
  assert.equal(
    confirmationPriority(
      { selfConfirmedAt: fresh, editorReviewedAt: fresh },
      now,
    ),
    3,
  );
  assert.equal(
    confirmationPriority(
      { selfConfirmedAt: null, editorReviewedAt: fresh },
      now,
    ),
    2,
  );
  assert.equal(
    confirmationPriority(
      { selfConfirmedAt: fresh, editorReviewedAt: null },
      now,
    ),
    1,
  );
  assert.equal(
    confirmationPriority(
      { selfConfirmedAt: null, editorReviewedAt: null },
      now,
    ),
    0,
  );
  assert.equal(
    isFreshConfirmation(
      new Date(now - CONFIRMATION_FRESH_MS).toISOString(),
      now,
    ),
    false,
  );
  assert.equal(
    isFreshConfirmation(
      new Date(now - CONFIRMATION_FRESH_MS + 1).toISOString(),
      now,
    ),
    true,
  );
  assert.equal(
    isFreshConfirmation(new Date(now + 1).toISOString(), now),
    false,
  );
  assert.equal(isFreshConfirmation("invalid", now), false);
  assert.match(
    confirmationDate(fresh),
    /September 18, 2026.*New Hampshire time/,
  );
  assert.equal(listingQuerySchema.parse({}).sort, "confirmed");
});
test("ideas, missing contacts and ownership are independent; public contacts are validated", () => {
  const value = submissionSchema.parse({
    kind: "group",
    name: "Anime discussion idea",
    summary: "I would like a local anime discussion group.",
    lifecycle: "proposed",
    seekingOrganizer: true,
    owner_id: "forged",
    referenceSources: [{ checkedAt: fresh }],
  });
  assert.equal(value.lifecycle, "proposed");
  assert.equal(value.seekingOrganizer, true);
  assert.equal(value.url, "");
  assert.equal("owner_id" in value, false);
  assert.equal("referenceSources" in value, false);
  const organization = {
    kind: "organization",
    name: "Example nonprofit",
    summary: "A local educational nonprofit.",
  };
  assert.ok(submissionSchema.safeParse(organization).success);
  assert.equal(
    submissionSchema.safeParse({
      ...organization,
      publicPhone: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(
    submissionSchema.safeParse({
      ...organization,
      publicEmail: "user@example.org\r\nBcc:private@example.org",
    }).success,
    false,
  );
});

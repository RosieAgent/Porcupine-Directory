import test from "node:test";
import assert from "node:assert/strict";
import { tagIconKey } from "../dist-server/shared/tag-icons.js";

test("topic symbols cover housing, learning and legacy aliases without renaming tags", () => {
  assert.equal(tagIconKey("Housing"), "home");
  assert.equal(tagIconKey("Learning"), "book");
  assert.equal(tagIconKey("Learning (Adult)"), "book");
  assert.equal(tagIconKey("  HOUSING  "), "home");
  assert.equal(tagIconKey("in person"), "meeting");
  assert.equal(tagIconKey("Website"), tagIconKey("website"));
  assert.equal(tagIconKey("New topic not yet mapped"), "tag");
  assert.equal(tagIconKey("<img src=https://tracker.example>"), "tag");
});

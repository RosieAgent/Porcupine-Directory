import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePublications,
  fetchPublications,
} from "../dist-server/server/publications.js";

const item = (
  title,
  date,
  url = "https://podcasters.spotify.com/pod/show/porcreport/episodes/" + title,
) =>
  `<item><title>${title}</title><pubDate>${date}</pubDate><link>${url}</link></item>`;
const rss = (items) =>
  `<rss><channel><title>The Porcupine Report with Eric Brakey</title>${items}</channel></rss>`;
test("publications are dated, deduplicated, newest first and limited to six", () => {
  const entries = Array.from({ length: 10 }, (_, i) =>
    item("Episode" + i, `2026-01-${String(i + 1).padStart(2, "0")}T12:00:00Z`),
  );
  const result = parsePublications(
    rss(entries.join("") + entries[0]),
    Date.parse("2026-02-01"),
  );
  assert.equal(result.length, 6);
  assert.equal(result[0].title, "Episode9");
  assert.equal(result[0].publishedAt, "2026-01-10T12:00:00.000Z");
  assert.deepEqual(Object.keys(result[0]).sort(), [
    "publishedAt",
    "title",
    "url",
  ]);
});
test("untrusted feeds cannot inject destinations, HTML players, entities or future dates", () => {
  const good = item("Safe &amp; sound", "2026-01-01");
  for (const url of [
    "javascript:alert(1)",
    "https://podcasters.spotify.com.evil.test/x",
    "https://user:secret@anchor.fm/x",
    "http://anchor.fm/x",
    "https://anchor.fm:8443/x",
  ]) {
    assert.equal(
      parsePublications(rss(good + item("Bad", "2026-01-02", url))).length,
      1,
    );
  }
  assert.equal(
    parsePublications(
      rss(good + item("Future", "2099-01-01") + item("Invalid", "bad")),
    ).length,
    1,
  );
  assert.equal(parsePublications(rss(good))[0].title, "Safe & sound");
  for (const xml of [
    "<html>Unavailable</html>",
    rss(""),
    "<!DOCTYPE rss>" + rss(good),
    "x".repeat(2_000_001),
  ])
    assert.throws(() => parsePublications(xml));
});
test("feed request is fixed, bounded and forbids redirects", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://anchor.fm/s/72228cd4/podcast/rss");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal);
      return new Response(rss(item("Safe", "2026-01-01")));
    };
    assert.equal((await fetchPublications()).length, 1);
    globalThis.fetch = async () => new Response("bad", { status: 503 });
    await assert.rejects(fetchPublications());
    globalThis.fetch = async () => new Response("x".repeat(2_000_001));
    await assert.rejects(fetchPublications());
  } finally {
    globalThis.fetch = original;
  }
});

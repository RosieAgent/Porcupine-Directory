import test from "node:test";
import assert from "node:assert/strict";
import {
  platformTagForUrl,
  platformTagForConnection,
} from "../dist-server/shared/platform-tags.js";
import { syncPlatformTags } from "../dist-server/server/tags.js";
test("platform tags require actual safe destination hosts, including Telegram web links", () => {
  for (const [url, expected] of [
    ["https://web.telegram.org/a/#-1001451394422", "Telegram"],
    ["https://t.me/example", "Telegram"],
    ["https://m.facebook.com/example", "Facebook"],
    ["https://join.slack.com/example", "Slack"],
    ["https://slack.com.evil.example/", undefined],
    ["https://example.org/?next=https://t.me/example", undefined],
    ["https://user:secret@facebook.com/", undefined],
    ["javascript:alert(1)", undefined],
  ])
    assert.equal(platformTagForUrl(url), expected);
});
test("platform synchronization adds only supported catalog tags, removes stale ones and keeps topic order", async () => {
  const client = {
    query: async (sql) => ({
      rows: sql.includes("tag_names")
        ? [
            { key: "facebook", name: "Facebook", retired: false },
            { key: "telegram", name: "Telegram", retired: false },
            { key: "slack", name: "Slack", retired: false },
            { key: "website", name: "Website", retired: false },
          ]
        : [],
    }),
  };
  assert.deepEqual(await syncPlatformTags(client, ["Website"], []), []);
  assert.deepEqual(
    await syncPlatformTags(
      client,
      [],
      [{ url: "https://example.org/", type: "website" }],
    ),
    ["Website"],
  );
  assert.deepEqual(
    await syncPlatformTags(
      client,
      ["Business", "Telegram", "Slack"],
      [{ type: "telegram", url: "https://facebook.com/example" }],
    ),
    ["Business", "Facebook"],
  );
  assert.deepEqual(
    await syncPlatformTags(
      client,
      ["Farming", "Telegram"],
      [
        { url: "https://t.me/example" },
        { url: "https://facebook.com/example" },
      ],
    ),
    ["Farming", "Telegram", "Facebook"],
  );
  assert.deepEqual(await syncPlatformTags(client, ["Slack"], []), []);
  await assert.rejects(
    () =>
      syncPlatformTags(
        client,
        Array.from({ length: 12 }, (_, i) => "Topic " + i),
        [{ url: "https://t.me/example" }],
      ),
    /12 tags total/,
  );
});

test("Website means a website connection, not every social link or a typed chat short-link", () => {
  for (const [link, expected] of [
    [{ url: "https://example.org/", type: "website" }, "Website"],
    [{ url: "https://youtube.com/example", type: "website" }, undefined],
    [{ url: "https://signal.group/#invite", type: "website" }, undefined],
    [{ url: "https://tinyurl.com/reviewed-signal", type: "signal" }, undefined],
    [{ url: "https://facebook.com/example", type: "website" }, "Facebook"],
    [{ url: "javascript:alert(1)", type: "website" }, undefined],
  ])
    assert.equal(platformTagForConnection(link), expected);
});

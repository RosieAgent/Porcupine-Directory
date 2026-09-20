import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { load } from "cheerio";
import { createSharePreviewHandler } from "../dist-server/server/share-preview.js";

const id = "11111111-1111-4111-8111-111111111111";
const origin = "https://directory.example";
const indexHtml = `<!doctype html><html><head><title>Old title</title>
<meta name="description" content="Old description"><meta property="og:url" content="https://old.example/private">
<link rel="canonical" href="https://old.example/private"><meta name="twitter:title" content="Old title">
</head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>`;

async function server(t, query) {
  const app = express();
  app.use(createSharePreviewHandler({ indexHtml, origin, db: { query } }));
  app.use((_req, res) => res.status(404).send("Not HTML"));
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  t.after(() => new Promise((resolve) => listener.close(resolve)));
  const base = `http://127.0.0.1:${listener.address().port}`;
  return (path, options) => fetch(base + path, options);
}

test("public listings render escaped, unique metadata in initial HTML without request tokens or host poisoning", async (t) => {
  const title = `Neighbors </title><script>alert('x')</script> & "Friends"`;
  const description = `Meet <img src=x onerror=alert(1)> & learn "together".`;
  const request = await server(t, async (sql, values) => {
    assert.match(sql, /SELECT name AS title, summary AS description/);
    assert.match(sql, /status='published'/);
    assert.deepEqual(values, [id]);
    return { rows: [{ title, description }] };
  });
  const response = await request(
    `/listings/${id}?token=TOP_SECRET&preview=true`,
    {
      headers: {
        Host: "attacker.example",
        "X-Forwarded-Host": "attacker.example",
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  const $ = load(html);
  assert.equal($("title").length, 1);
  assert.equal($("title").text(), title + " · Porcupine Directory");
  assert.equal($("meta[name=description]").attr("content"), description);
  assert.equal(
    $("meta[property='og:title']").attr("content"),
    $("title").text(),
  );
  assert.equal(
    $("meta[property='og:description']").attr("content"),
    description,
  );
  assert.equal($("meta[property='og:type']").attr("content"), "website");
  assert.equal(
    $("link[rel=canonical]").attr("href"),
    `${origin}/listings/${id}`,
  );
  assert.equal(
    $("meta[property='og:url']").attr("content"),
    `${origin}/listings/${id}`,
  );
  assert.equal($("meta[name=robots]").length, 0);
  assert.equal($("script").length, 1);
  assert.equal($("script").attr("src"), "/assets/app.js");
  assert.equal($("img").length, 0);
  assert.doesNotMatch(
    html,
    /TOP_SECRET|attacker\.example|old\.example|preview=true|twitter:/,
  );
});

test("event previews query only visible events and bound long descriptions", async (t) => {
  const request = await server(t, async (sql, values) => {
    assert.match(sql, /FROM events WHERE id=\$1/);
    assert.match(sql, /coalesce\(raw_payload->>'hidden','false'\) <> 'true'/);
    assert.deepEqual(values, [id]);
    return {
      rows: [{ title: "Community\n gathering", description: "a".repeat(1000) }],
    };
  });
  const $ = load(await (await request(`/events/${id}/?token=secret`)).text());
  assert.equal($("title").text(), "Community gathering · Porcupine Directory");
  assert.equal($("meta[name=description]").attr("content").length, 280);
  assert.equal($("link[rel=canonical]").attr("href"), `${origin}/events/${id}`);
});

test("unpublished, archived, missing and hidden records have generic nonindexable HTML even with a session", async (t) => {
  const request = await server(t, async () => ({ rows: [] }));
  for (const path of [`/listings/${id}`, `/events/${id}`]) {
    const response = await request(path + "?token=PRIVATE", {
      headers: { Cookie: "session=OWNER" },
    });
    const html = await response.text();
    const $ = load(html);
    assert.equal($("title").text(), "Porcupine Directory");
    assert.equal($("meta[name=robots]").attr("content"), "noindex, nofollow");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal($("link[rel=canonical], meta[property^='og:']").length, 0);
    assert.doesNotMatch(html, /PRIVATE|OWNER|old\.example/);
  }
});

test("private, edit, history, token and malformed routes never query content or include their URLs", async (t) => {
  const request = await server(t, () => {
    assert.fail("private route queried the database");
  });
  for (const path of [
    "/account",
    "/account/security",
    "/admin",
    "/editor",
    "/saved",
    "/activate?token=SECRET",
    "/recover?token=SECRET",
    "/login?next=/account",
    `/listings/${id}/edit`,
    `/listings/${id}/history`,
    "/listings/not-a-uuid",
    "/events/%27%20OR%201=1",
    "/unknown",
  ]) {
    const response = await request(path);
    const html = await response.text();
    const $ = load(html);
    assert.equal($("title").text(), "Porcupine Directory");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal($("meta[property^='og:'], link[rel=canonical]").length, 0);
    assert.doesNotMatch(html, /SECRET|\/account|\/history|\/edit|old\.example/);
  }
});

test("HTML HEAD is supported, non-HTML/mutations pass through and lookup errors fail closed", async (t) => {
  let calls = 0;
  const request = await server(t, async () => {
    calls++;
    throw new Error("DATABASE_PASSWORD=private");
  });
  for (const options of [
    { method: "POST" },
    { headers: { Accept: "application/json" } },
  ]) {
    assert.equal((await request(`/listings/${id}`, options)).status, 404);
  }
  assert.equal(calls, 0);
  const failed = await request(`/listings/${id}`);
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.doesNotMatch(await failed.text(), /DATABASE_PASSWORD|private/);
  const head = await request("/account", { method: "HEAD" });
  assert.equal(head.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(await head.text(), "");
});

test("canonical origin rejects credentials, queries, fragments, paths and non-web schemes", () => {
  for (const bad of [
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com/?token=x",
    "https://example.com/#x",
    "https://example.com/private",
  ]) {
    assert.throws(() =>
      createSharePreviewHandler({ indexHtml, origin: bad, db: { query() {} } }),
    );
  }
});

test("public browse pages retain generic metadata without private query values or a noindex directive", async (t) => {
  const request = await server(t, () => {
    assert.fail("browse route queried preview content");
  });
  for (const path of [
    "/",
    "/directory?tags=public&token=PRIVATE",
    "/events/calendar?month=2026-09",
    "/about",
  ]) {
    const response = await request(path);
    const html = await response.text();
    const $ = load(html);
    assert.equal($("title").text(), "Porcupine Directory");
    assert.equal(
      $("meta[property^='og:'], link[rel=canonical], meta[name=robots]").length,
      0,
    );
    assert.equal(response.headers.get("x-robots-tag"), null);
    assert.doesNotMatch(html, /PRIVATE|old\.example/);
  }
});

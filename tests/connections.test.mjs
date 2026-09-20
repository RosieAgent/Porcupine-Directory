import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  classifyConnection,
  legacyConnections,
  connectionsSchema,
  uniqueConnections,
  connectionText,
  groupConnections,
} from "../dist-server/shared/connections.js";
test("primary links summarize destinations and keep secondary resources without inventing URLs", () => {
  const make = (url, type = "website", placement = undefined) => ({
    id: randomUUID(),
    url,
    type,
    label: "",
    ...(placement ? { placement } : {}),
  });
  const website = make("https://example.org/");
  const subpage = make("https://example.org/contact");
  const group = make("https://www.facebook.com/groups/community", "facebook");
  const official = make("https://www.facebook.com/community", "facebook");
  const external = make("https://second.example.org/");
  const input = [subpage, group, website, official, external];
  const before = structuredClone(input);
  const split = groupConnections(input);
  assert.deepEqual(
    split.primary.map((x) => x.id),
    [website.id, official.id],
  );
  assert.deepEqual(
    split.additional.map((x) => x.id),
    [group.id, external.id],
  );
  assert.deepEqual(
    split.omitted.map((x) => x.id),
    [subpage.id],
  );
  assert.deepEqual(input, before);
  const explicit = { ...subpage, placement: "additional" };
  assert.ok(
    groupConnections([website, explicit]).additional.some(
      (x) => x.id === explicit.id,
    ),
  );
  assert.equal(groupConnections([subpage]).primary[0].url, subpage.url);
  for (const url of [
    "https://example.org/join#secret",
    "https://example.org/join?code=secret",
    "https://example.org:8443/contact",
    "https://www.example.org/contact",
  ])
    assert.equal(groupConnections([website, make(url)]).additional.length, 1);
  const primaryWebsites = [
    { ...website, placement: "primary" },
    { ...external, placement: "primary" },
  ];
  assert.equal(connectionsSchema.safeParse(primaryWebsites).success, false);
  assert.equal(
    legacyConnections({ links: [{ url: explicit.url, label: "" }] }, [
      explicit,
    ])[0].placement,
    "additional",
  );
});
import { submissionSchema } from "../dist-server/shared/contracts.js";
import {
  usernameSchema,
  passwordSchema,
  confirmedPasswordSchema,
} from "../dist-server/shared/auth.js";
test("password confirmation requires an exact match without normalizing secrets", () => {
  const password = "Long password with symbols !@# ";
  assert.equal(
    confirmedPasswordSchema.parse({ password, confirmation: password }),
    password,
  );
  for (const confirmation of [
    "",
    password.trim(),
    password.toLowerCase(),
    password + "x",
  ])
    assert.equal(
      confirmedPasswordSchema.safeParse({ password, confirmation }).success,
      false,
    );
});
test("display links deduplicate destinations without rewriting stored URLs", () => {
  const make = (url, label = "", type = "website") => ({
    id: randomUUID(),
    url,
    label,
    type,
  });
  const old = make("http://example.org", "Imported business");
  const secure = make("https://example.org/", "Official website");
  const links = [
    old,
    secure,
    make("https://EXAMPLE.org:443/", "Another name"),
    make("https://example.org/contact", "Contact"),
    make("https://example.org/?view=events"),
    make("https://example.org/#team"),
    make("https://www.example.org/"),
    make("http://example.org:8080/"),
    make("https://example.org:8080/"),
    make("https://signal.group/#first", "Main chat", "signal"),
    make("https://signal.group/#second", "Events chat", "signal"),
    make("javascript:alert(1)"),
  ];
  const before = structuredClone(links);
  const visible = uniqueConnections(links);
  assert.equal(visible.length, 9);
  assert.equal(visible[0].id, secure.id);
  assert.deepEqual(links, before);
  assert.equal(connectionText(secure), "example.org");
  assert.equal(connectionText(visible[1]), "Contact");
  assert.equal(uniqueConnections([secure, old])[0].id, secure.id);
  assert.equal(
    uniqueConnections([
      make("https://example.org/Contact"),
      make("https://example.org/contact"),
    ]).length,
    2,
  );
  assert.equal(
    uniqueConnections([
      make("https://example.org/?q=one"),
      make("https://example.org/?q=two"),
    ]).length,
    2,
  );
});
test("username punctuation and normalization do not restrict passwords", () => {
  for (const name of [
    "private.name",
    "private-name!",
    "name+test@nh",
    "François",
    "NH#builder",
  ])
    assert.ok(usernameSchema.safeParse(name).success);
  assert.equal(usernameSchema.parse(" ＮＨ.Builder! "), "nh.builder!");
  for (const name of [
    "ab",
    "name with spaces",
    "bad\u200bname",
    "bad\nname",
    "a".repeat(33),
  ])
    assert.equal(usernameSchema.safeParse(name).success, false);
  assert.ok(passwordSchema.safeParse("$pec!al password, with spaces").success);
});
test("classify exact destinations without visiting or stripping fragments", () => {
  assert.equal(
    classifyConnection("https://signal.group/#invite-fragment"),
    "signal",
  );
  assert.equal(
    classifyConnection("https://signal.group.evil.invalid/chat"),
    "website",
  );
  assert.equal(
    classifyConnection("https://example.org/?next=signal.group"),
    "website",
  );
  assert.equal(classifyConnection("javascript:alert(1)"), "other");
  const links = [
    { label: "Main chat", url: "https://signal.group/#first" },
    { label: "Events chat", url: "https://signal.group/#second" },
    { label: "Website", url: "https://example.org/" },
  ];
  const connections = legacyConnections({
    links,
    url: links[0].url,
    contact_url: "https://example.org/contact",
  });
  assert.equal(connections.length, 4);
  assert.equal(connections[0].url, links[0].url);
  assert.deepEqual(
    legacyConnections(
      { links, url: links[0].url, contact_url: "https://example.org/contact" },
      connections,
    ),
    connections,
  );
  assert.deepEqual(legacyConnections({}), []);
  assert.ok(connectionsSchema.safeParse(connections).success);
});
test("unsafe, credential-bearing, duplicate-ID and excessive connections are rejected", () => {
  assert.ok(
    submissionSchema.safeParse({
      kind: "group",
      name: "Linkless group",
      summary: "No links are known yet.",
      url: "",
      contactUrl: "",
      connections: [],
    }).success,
  );
  const item = {
    id: randomUUID(),
    type: "website",
    url: "https://example.org",
    label: "",
  };
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:password@example.org/",
  ])
    assert.equal(
      connectionsSchema.safeParse([{ ...item, url }]).success,
      false,
    );
  assert.equal(connectionsSchema.safeParse([item, item]).success, false);
  assert.equal(
    connectionsSchema.safeParse(
      Array.from({ length: 31 }, () => ({ ...item, id: randomUUID() })),
    ).success,
    false,
  );
});

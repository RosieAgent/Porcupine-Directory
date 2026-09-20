// Isolated disposable schema. Never creates accounts or sample listings in the live directory.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL for tests.");
const schema = "auth_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: url });
const scoped = new URL(url);
scoped.searchParams.set("options", "-c search_path=" + schema);
process.env.DATABASE_URL = scoped.toString();
process.env.DATABASE_SCHEMA = schema;
process.env.START_SERVER = "false";
process.env.FSP_SYNC_ENABLED = "false";
// Keep the integration fixture independent of a developer's Mailpit preview mode.
process.env.SMTP_MODE = "smtp";
process.env.STAFF_AUTH_MODE = "passkey";
// Exercise the preserved v0.2 opt-in path in this isolated schema.
process.env.PASSKEYS_ENABLED = "true";
process.env.APP_ORIGIN = "http://localhost:4351";
process.env.SESSION_SECRET = randomUUID() + randomUUID();
let server, pool, store, chromiumBrowser, emailServer;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  ({ pool } = await import("../dist-server/server/db.js"));
  await pool.query(await readFile("db/init/001_schema.sql", "utf8"));
  const migrationLinks = [
    { label: "Main chat", url: "https://signal.group/#preserve-invitation" },
    { label: "Events chat", url: "https://signal.group/#second" },
    { label: "Website", url: "https://example.org/" },
  ];
  const legacyId = (
    await pool.query(
      "INSERT INTO listings(kind,name,summary,url,links,status) VALUES ('group','Migration fixture','Connection migration fixture',$1,$2,'published') RETURNING id",
      [migrationLinks[0].url, JSON.stringify(migrationLinks)],
    )
  ).rows[0].id;
  const { app } = await import("../dist-server/server/index.js");
  const migrated = (
    await pool.query("SELECT * FROM listings WHERE id=$1", [legacyId])
  ).rows[0];
  assert.equal(migrated.connections.length, 3);
  assert.equal(migrated.connections[0].type, "signal");
  assert.equal(migrated.connections[0].url, migrationLinks[0].url);
  assert.deepEqual(migrated.links, migrationLinks);
  const { migrate } = await import("../dist-server/server/migrate.js");
  await migrate();
  assert.deepEqual(
    (
      await pool.query("SELECT connections FROM listings WHERE id=$1", [
        legacyId,
      ])
    ).rows[0].connections,
    migrated.connections,
  );
  ({ sessionStore: store } = await import("../dist-server/server/security.js"));
  server = app.listen(4351, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let base = "http://127.0.0.1:" + server.address().port + "/api";
  function browser() {
    let cookie = "";
    return {
      async call(path, method = "GET", body, expected = 200, csrf = true) {
        let token;
        if (method !== "GET" && csrf) {
          const r = await fetch(base + "/auth/csrf", { headers: { cookie } });
          if (r.headers.get("set-cookie"))
            cookie = r.headers.get("set-cookie").split(";")[0];
          assert.equal(r.status, 200);
          token = (await r.json()).token;
        }
        const response = await fetch(base + path, {
          method,
          headers: {
            cookie,
            "Content-Type": "application/json",
            ...(token ? { "X-CSRF-Token": token } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.headers.get("set-cookie"))
          cookie = response.headers.get("set-cookie").split(";")[0];
        const data = await response.json();
        assert.equal(
          response.status,
          expected,
          `${method} ${path}: ${JSON.stringify(data)}`,
        );
        return data;
      },
      get cookie() {
        return cookie;
      },
    };
  }
  const anonymous = browser(),
    alice = browser(),
    bob = browser();
  assert.equal((await anonymous.call("/auth/session")).user, null);
  assert.equal(anonymous.cookie, "");
  const { inviteAccount, renewAccountInvitation } =
    await import("../dist-server/server/setup-account.js");
  for (const role of ["user", "editor", "administrator"]) {
    const invited = browser();
    const username = `setup.${role}!`;
    const token = await inviteAccount(username, role);
    const waiting = (
      await pool.query(
        "SELECT a.role,s.token_hash FROM accounts a JOIN account_setup s ON s.account_id=a.id WHERE username=$1",
        [username],
      )
    ).rows[0];
    assert.equal(waiting.role, "user");
    assert.notEqual(waiting.token_hash, token);
    await assert.rejects(() => inviteAccount(username, "administrator"));
    await anonymous.call(
      "/auth/signup",
      "POST",
      { username, password: "cannot take an invited account" },
      409,
    );
    const result = await invited.call("/auth/activate", "POST", {
      token,
      password: "private setup password !@#$",
      role: "administrator",
    });
    assert.equal(result.phrase.split(" ").length, 12);
    assert.equal((await invited.call("/auth/session")).user.role, role);
    assert.equal((await invited.call("/auth/session")).user.strong, false);
    await invited.call("/listings/manage?all=true", "GET", undefined, 403);
    await invited.call(
      "/auth/activate",
      "POST",
      { token, password: "cannot reuse this setup invitation" },
      400,
    );
    const login = browser();
    await login.call("/auth/login", "POST", {
      username: username.toUpperCase(),
      password: "private setup password !@#$",
    });
    assert.equal((await login.call("/auth/session")).user.username, username);
    assert.ok(
      !JSON.stringify(
        (await pool.query("SELECT * FROM security_audit")).rows,
      ).includes(token),
    );
  }
  const expired = await inviteAccount("setup.expired", "user");
  await pool.query(
    "UPDATE account_setup SET expires_at=now()-interval '1 second'",
  );
  await anonymous.call(
    "/auth/activate",
    "POST",
    { token: expired, password: "expired invite must not work" },
    400,
  );
  await anonymous.call("/auth/signup", "POST", {}, 403, false);
  const renewed = await renewAccountInvitation("setup.expired");
  assert.notEqual(renewed, expired);
  await assert.rejects(() => renewAccountInvitation("setup.user!"));
  const entry = {
    kind: "group",
    name: "Integration test group",
    summary: "A temporary test entry for security checks.",
  };
  const anonEntry = await anonymous.call(
    "/listings",
    "POST",
    {
      ...entry,
      owner_id: randomUUID(),
      selfConfirmedAt: new Date().toISOString(),
    },
    201,
  );
  assert.equal(anonEntry.status, "published");
  const publicEntry = await anonymous.call("/listings/" + anonEntry.id);
  assert.equal(publicEntry.selfConfirmedAt, null);
  assert.equal(publicEntry.editorReviewedAt, null);
  assert.equal("owner_id" in publicEntry, false);
  await anonymous.call(
    `/listings/${anonEntry.id}`,
    "PUT",
    { entry, version: 1, reason: "test" },
    401,
  );
  const credentials = {
    username: "test_alice",
    password: "a sufficiently long test password",
  };
  const recovery = await alice.call("/auth/signup", "POST", credentials, 201);
  assert.equal(recovery.phrase.split(" ").length, 12);
  await alice.call("/auth/recovery/saved", "POST", {});
  const account = (await alice.call("/auth/session")).user;
  assert.equal(account.role, "user");
  assert.equal(account.recoverySaved, true);
  process.env.PASSKEYS_ENABLED = "false";
  assert.equal((await alice.call("/auth/session")).passkeysEnabled, false);
  await alice.call("/auth/passkeys/register/options", "POST", {}, 404);
  await anonymous.call("/auth/passkeys/login/options", "POST", {}, 404);
  process.env.PASSKEYS_ENABLED = "true";
  const staleName = "Stale session must not submit";
  await anonymous.call(
    "/listings",
    "POST",
    { ...entry, name: staleName, expectedAccountId: account.id },
    409,
  );
  await alice.call(
    "/listings",
    "POST",
    { ...entry, name: staleName, expectedAccountId: randomUUID() },
    409,
  );
  await alice.call(
    "/listings",
    "POST",
    { ...entry, name: staleName, expectedAccountId: null },
    409,
  );
  assert.equal(
    (await anonymous.call("/listings?q=" + encodeURIComponent(staleName)))
      .total,
    0,
  );
  await alice.call(
    "/listings",
    "POST",
    { ...entry, location: "Concrodd" },
    400,
  );
  const removable = await alice.call(
    "/listings",
    "POST",
    {
      ...entry,
      name: "Owner archive location fixture",
      location: "concord",
      expectedAccountId: account.id,
    },
    201,
  );
  assert.equal(
    (await anonymous.call(`/listings/${removable.id}`)).location,
    "Concord, NH",
  );
  for (const location of ["concord", "CONCORD", "Concord, NH"])
    assert.equal(
      (
        await anonymous.call(
          "/listings?q=archive&location=" + encodeURIComponent(location),
        )
      ).items[0].id,
      removable.id,
    );
  await anonymous.call(
    `/listings/${removable.id}/action`,
    "POST",
    { action: "hide", version: 1, reason: "Cannot archive anonymously" },
    401,
  );
  await alice.call(`/listings/${removable.id}/action`, "POST", {
    action: "hide",
    version: 1,
    reason: "Remove my test listing",
  });
  await anonymous.call(`/listings/${removable.id}`, "GET", undefined, 404);
  assert.equal(
    (await alice.call(`/listings/${removable.id}/edit`)).status,
    "archived",
  );
  assert.ok(
    (await alice.call("/listings/manage")).items.some(
      (item) => item.id === removable.id,
    ),
  );
  await alice.call(
    `/listings/${removable.id}/action`,
    "POST",
    { action: "publish", version: 2, reason: "Cannot bypass moderation" },
    403,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT action FROM listing_revisions WHERE listing_id=$1 AND version=2",
        [removable.id],
      )
    ).rows[0].action,
    "hide",
  );
  await bob.call(
    "/auth/signup",
    "POST",
    { username: "test_bob", password: credentials.password, words: 24 },
    201,
  );
  const owned = await alice.call("/listings", "POST", entry, 201);
  await bob.call(
    `/listings/${owned.id}`,
    "PUT",
    { entry, version: 1, reason: "test" },
    403,
  );
  await alice.call(
    `/listings/${anonEntry.id}`,
    "PUT",
    { entry, version: 1, reason: "test" },
    403,
  );
  await alice.call(`/listings/${owned.id}/action`, "POST", {
    action: "confirm",
    version: 1,
    reason: "Owner verified",
  });
  assert.ok((await anonymous.call(`/listings/${owned.id}`)).selfConfirmedAt);
  await alice.call(`/listings/${owned.id}`, "PUT", {
    entry: { ...entry, name: "Updated title" },
    version: 2,
    reason: "Correct title",
  });
  const updated = await anonymous.call(`/listings/${owned.id}`);
  assert.equal(updated.version, 3);
  assert.equal(updated.selfConfirmedAt, null);
  await alice.call(
    `/listings/${owned.id}`,
    "PUT",
    { entry, version: 2, reason: "Stale edit" },
    409,
  );
  await alice.call(
    `/listings/${owned.id}/action`,
    "POST",
    { action: "review", version: 3, reason: "No privilege" },
    403,
  );
  await alice.call("/account/saved/" + owned.id, "PUT", {});
  assert.deepEqual((await bob.call("/account/saved")).ids, []);
  const secondDevice = browser();
  await secondDevice.call("/auth/login", "POST", credentials);
  assert.deepEqual((await secondDevice.call("/account/saved")).ids, [owned.id]);
  await alice.call(`/listings/${owned.id}/history`, "GET", undefined, 403);
  await alice.call(
    "/admin/role",
    "PUT",
    { username: "test_bob", role: "editor" },
    403,
  );
  // Test authorization independently of hardware by marking ONLY this isolated session as strong.
  await pool.query("UPDATE accounts SET role='administrator' WHERE id=$1", [
    account.id,
  ]);
  await pool.query(
    "UPDATE sessions SET sess=jsonb_set(sess::jsonb,'{strongAt}',to_jsonb($1::bigint)) WHERE sess->>'accountId'=$2",
    [Date.now(), account.id],
  );
  await alice.call(`/listings/${owned.id}/action`, "POST", {
    action: "review",
    version: 3,
    reason: "Editor checked",
  });
  const reviewed = await anonymous.call(`/listings/${owned.id}`);
  assert.ok(reviewed.editorReviewedAt);
  // Ranking uses server dates and check tiers; counts/pagination are unchanged.
  const rankRows = [];
  for (const [name, selfAge, reviewAge] of [
    ["Z both", 1, 1],
    ["Y reviewed", null, 1],
    ["X self", 1, null],
    ["A old", 181, 181],
    ["B no checks", null, null],
    ["C future", -1, -1],
  ]) {
    const id = (
      await pool.query(
        "INSERT INTO listings(kind,name,summary,status,self_confirmed_at,editor_reviewed_at) VALUES ('group',$1,'rankingfixture','published',$2,$3) RETURNING id",
        [
          name,
          selfAge === null ? null : new Date(Date.now() - selfAge * 86400000),
          reviewAge === null
            ? null
            : new Date(Date.now() - reviewAge * 86400000),
        ],
      )
    ).rows[0].id;
    rankRows.push(id);
  }
  const ranked = await anonymous.call("/listings?q=rankingfixture");
  assert.deepEqual(
    ranked.items.map((item) => item.id),
    rankRows,
  );
  assert.equal(ranked.total, 6);
  const alphabetic = await anonymous.call(
    "/listings?q=rankingfixture&sort=name",
  );
  assert.deepEqual(
    alphabetic.items.map((item) => item.name),
    ["A old", "B no checks", "C future", "X self", "Y reviewed", "Z both"],
  );
  // Completeness outranks even recent review/confirmation, before pagination,
  // and applies to each sort mode. A missing-only filter still returns entries.
  for (let i = 0; i < 14; i++) {
    const missing = i === 13;
    await pool.query(
      "INSERT INTO listings(kind,name,summary,status,access_instructions,public_phone,public_email,connections,self_confirmed_at,editor_reviewed_at,updated_at) VALUES ('group',$1,'completenessfixture','published',$2,$3,$4,$5,$6,$6,$7)",
      [
        missing
          ? "A missing but reviewed"
          : `Complete ${String(i).padStart(2, "0")}`,
        !missing && i % 4 === 0
          ? "Ask at the public library desk."
          : "Ask to join",
        !missing && i % 4 === 1 ? "603-555-0100" : "",
        !missing && i % 4 === 2 ? "contact@example.org" : "",
        JSON.stringify(
          !missing && i % 4 === 3
            ? [
                {
                  id: randomUUID(),
                  type: "website",
                  label: "Contact",
                  url: "https://example.org/contact",
                },
              ]
            : [],
        ),
        missing ? new Date() : null,
        new Date(Date.now() - (missing ? 0 : (i + 1) * 86400000)),
      ],
    );
  }
  for (const sort of ["confirmed", "name", "recent"]) {
    const first = await anonymous.call(
      `/listings?q=completenessfixture&sort=${sort}&pageSize=12`,
    );
    const second = await anonymous.call(
      `/listings?q=completenessfixture&sort=${sort}&pageSize=12&page=2`,
    );
    assert.equal(first.total, 14);
    assert.equal(first.items.length, 12);
    assert.ok(first.items.every((item) => !item.missingJoiningDetails));
    assert.equal(second.items.length, 2);
    assert.equal(second.items[0].missingJoiningDetails, false);
    assert.equal(second.items[1].name, "A missing but reviewed");
  }
  const incompleteOnly = await anonymous.call(
    "/listings?q=completenessfixture&needs=joining_details",
  );
  assert.equal(incompleteOnly.total, 1);
  assert.equal(incompleteOnly.items[0].missingJoiningDetails, true);
  // Explicit proposals, existing linkless groups and unknown imported gaps stay distinct.
  const proposal = await alice.call(
    "/listings",
    "POST",
    {
      ...entry,
      name: "Anime proposal",
      lifecycle: "proposed",
      seekingOrganizer: true,
    },
    201,
  );
  const proposalData = await anonymous.call(`/listings/${proposal.id}`);
  assert.equal(proposalData.missingJoiningDetails, true);
  assert.equal(proposalData.lifecycle, "proposed");
  const guided = await alice.call(
    "/listings",
    "POST",
    {
      ...entry,
      name: "Linkless existing group",
      lifecycle: "existing",
      accessInstructions:
        "Attend the weekly open meeting at the public library.",
    },
    201,
  );
  assert.equal(
    (await anonymous.call(`/listings/${guided.id}`)).missingJoiningDetails,
    false,
  );
  const sparse = await alice.call(
    "/listings",
    "POST",
    {
      ...entry,
      name: "Sparse imported fixture",
      accessInstructions:
        "Joining details have not been provided. Check the source document for updates.",
    },
    201,
  );
  assert.equal(
    (await anonymous.call(`/listings/${sparse.id}`)).missingJoiningDetails,
    true,
  );
  assert.equal(
    (await anonymous.call(`/listings/${sparse.id}`)).lifecycle,
    "unknown",
  );
  for (const instructions of [
    "Ask to join",
    "Ask to join.\n\nAccess has not been independently verified. A listed link does not guarantee admission.",
    "Request an invitation",
    "Invite only",
  ]) {
    const result = await pool.query(
      "SELECT listing_has_joining_details('[]'::jsonb,$1) AS complete",
      [instructions],
    );
    assert.equal(result.rows[0].complete, false);
  }
  assert.equal(
    (
      await pool.query(
        "SELECT listing_has_joining_details('[]'::jsonb,'Ask to join at the public library desk.') AS complete",
      )
    ).rows[0].complete,
    true,
  );
  assert.ok(
    (
      await anonymous.call("/listings?lifecycle=proposed&needs=organizer")
    ).items.some((item) => item.id === proposal.id),
  );
  await alice.call(`/listings/${proposal.id}/action`, "POST", {
    version: 1,
    action: "review",
    reason: "Proposal details reviewed",
  });
  await alice.call(`/listings/${proposal.id}`, "PUT", {
    version: 2,
    reason: "Now an operating group",
    entry: {
      ...entry,
      name: "Anime proposal",
      lifecycle: "existing",
      seekingOrganizer: false,
    },
  });
  assert.equal(
    (await anonymous.call(`/listings/${proposal.id}`)).editorReviewedAt,
    null,
  );
  await alice.call(`/listings/${proposal.id}/restore`, "POST", {
    version: 3,
    targetVersion: 1,
    reason: "Restore original proposal",
  });
  assert.equal(
    (await anonymous.call(`/listings/${proposal.id}`)).lifecycle,
    "proposed",
  );
  assert.equal(
    (await anonymous.call(`/listings/${proposal.id}`)).seekingOrganizer,
    true,
  );
  const { applyEnrichment } =
    await import("../dist-server/server/enrichment.js");
  const sampleResearch = {
    id: proposal.id,
    expectedVersion: 4,
    expectedName: "Anime proposal",
    reason: "Synthetic website research workflow test",
    patch: {
      publicPhone: "603-555-0100",
      publicAddress: "Public test venue",
      openingHours: "By appointment",
    },
    connections: [],
    sources: [
      {
        label: "Synthetic source",
        url: "https://example.org/",
        checkedAt: new Date().toISOString(),
      },
    ],
  };
  await assert.rejects(() =>
    applyEnrichment([
      sampleResearch,
      { ...sampleResearch, expectedVersion: 999 },
    ]),
  );
  assert.equal((await anonymous.call(`/listings/${proposal.id}`)).version, 4);
  await applyEnrichment([sampleResearch]);
  const enriched = await anonymous.call(`/listings/${proposal.id}`);
  assert.equal(enriched.referenceSources.length, 1);
  assert.equal(enriched.publicPhone, "603-555-0100");
  assert.equal(enriched.lifecycle, "proposed");
  assert.equal(enriched.seekingOrganizer, true);
  assert.equal(enriched.selfConfirmedAt, null);
  assert.equal(enriched.editorReviewedAt, null);
  assert.equal(enriched.missingJoiningDetails, false);
  await alice.call(`/listings/${proposal.id}`, "PUT", {
    version: 5,
    reason: "Change researched contact",
    entry: {
      ...entry,
      name: "Anime proposal",
      publicPhone: "603-555-0101",
      referenceSources: sampleResearch.sources,
    },
  });
  assert.deepEqual(
    (await anonymous.call(`/listings/${proposal.id}`)).referenceSources,
    [],
  );
  // Multiple matching connections produce one listing, preserve IDs and are audited/restorable.
  const connections = [
    {
      id: randomUUID(),
      type: "signal",
      url: "https://signal.group/#chat-one",
      label: "Main chat",
    },
    {
      id: randomUUID(),
      type: "signal",
      url: "https://signal.group/#chat-two",
      label: "Events chat",
    },
    {
      id: randomUUID(),
      type: "website",
      url: "https://example.org/",
      label: "Website",
    },
  ];
  const multi = await alice.call(
    "/listings",
    "POST",
    { ...entry, name: "Multi connection fixture", connections },
    201,
  );
  const channel = await alice.call(
    "/listings",
    "POST",
    { ...entry, name: "Multi channel fixture", kind: "channel", connections },
    201,
  );
  const matching = await anonymous.call(
    "/listings?connection=signal&q=Multi&view=table",
  );
  assert.equal(matching.total, 2);
  assert.deepEqual(
    new Set(matching.items.map((item) => item.id)),
    new Set([multi.id, channel.id]),
  );
  await alice.call(`/listings/${multi.id}/action`, "POST", {
    version: 1,
    action: "review",
    reason: "Verify connections",
  });
  await alice.call(`/listings/${multi.id}`, "PUT", {
    version: 2,
    reason: "Change connection only",
    entry: {
      ...entry,
      name: "Multi connection fixture",
      connections: connections.slice(1),
    },
  });
  assert.equal(
    (await anonymous.call(`/listings/${multi.id}`)).editorReviewedAt,
    null,
  );
  await alice.call(`/listings/${multi.id}/restore`, "POST", {
    version: 3,
    targetVersion: 1,
    reason: "Restore connections",
  });
  assert.deepEqual(
    (await anonymous.call(`/listings/${multi.id}`)).connections,
    connections,
  );
  await alice.call(
    `/listings/${multi.id}`,
    "PUT",
    {
      version: 3,
      reason: "Stale connection change",
      entry: { ...entry, connections: [] },
    },
    409,
  );
  // Restoring a pre-migration revision reconstructs destinations without losing fragments.
  await alice.call(`/listings/${legacyId}/restore`, "POST", {
    version: migrated.version,
    targetVersion: 1,
    reason: "Restore old schema revision",
  });
  assert.deepEqual(
    (await anonymous.call(`/listings/${legacyId}`)).connections.map(
      ({ url }) => url,
    ),
    migrationLinks.map(({ url }) => url),
  );
  const { importDirectory } =
    await import("../dist-server/server/directory-import.js");
  const importHtml = `<body><h1>Social Groups</h1><h2>Regional Groups</h2><h3 id="fixture">Import connection fixture</h3><p>Purpose: Meet friendly neighbors</p><p>Link: <a href="https://signal.group/#import-fragment">Chat</a><a href="https://example.org/site">Website</a></p></body>`;
  // Explicit staff-reviewed import tags; imports no longer create arbitrary definitions.
  for (const name of ["Social Groups", "Regional Groups"])
    await alice.call(
      "/tags",
      "POST",
      { name, icon: "people", reason: "Review fixture import tag" },
      201,
    );
  await importDirectory(importHtml);
  const imported = (
    await pool.query(
      "SELECT * FROM listings WHERE source_key='porcupine_document'",
    )
  ).rows[0];
  await importDirectory(importHtml);
  const repeated = (
    await pool.query("SELECT * FROM listings WHERE id=$1", [imported.id])
  ).rows[0];
  assert.equal(repeated.version, imported.version);
  assert.deepEqual(repeated.connections, imported.connections);
  const editImported = await alice.call(`/listings/${imported.id}/edit`);
  await alice.call(`/listings/${imported.id}`, "PUT", {
    version: editImported.version,
    reason: "Maintain local connections",
    entry: {
      ...editImported,
      url: editImported.url ?? "",
      contactUrl: editImported.contactUrl ?? "",
      location: editImported.location ?? "",
      connections,
    },
  });
  await importDirectory(
    importHtml.replace("import-fragment", "upstream-change"),
  );
  assert.deepEqual(
    (await anonymous.call(`/listings/${imported.id}`)).connections,
    connections,
  );
  await alice.call(`/listings/${owned.id}/restore`, "POST", {
    version: 4,
    targetVersion: 1,
    reason: "Undo title update",
  });
  const restored = await anonymous.call(`/listings/${owned.id}`);
  assert.equal(restored.version, 5);
  assert.equal(restored.name, entry.name);
  assert.equal(restored.editorReviewedAt, null);
  await alice.call(`/listings/${owned.id}/action`, "POST", {
    action: "hide",
    version: 5,
    reason: "Test hiding",
  });
  await anonymous.call(`/listings/${owned.id}`, "GET", undefined, 404);
  const history = await alice.call(`/listings/${owned.id}/history`);
  assert.equal(history.items.length, 6);
  assert.equal(history.items[1].action, "restore");
  process.env.SUBMISSION_POLICY = "pending_review";
  const held = await anonymous.call("/listings", "POST", entry, 201);
  assert.equal(held.status, "pending_review");
  await anonymous.call("/listings/" + held.id, "GET", undefined, 404);
  process.env.SUBMISSION_POLICY = "published";
  // Recovery invalidates all sessions and the old phrase, and suspends staff privileges.
  const recoverer = browser();
  const rotated = await recoverer.call("/auth/recover", "POST", {
    username: credentials.username,
    phrase: recovery.phrase,
    password: "a replacement long password",
  });
  assert.notEqual(rotated.phrase, recovery.phrase);
  assert.equal((await secondDevice.call("/auth/session")).user, null);
  const recovered = (await recoverer.call("/auth/session")).user;
  assert.equal(recovered.privilegesSuspended, true);
  await recoverer.call(
    "/admin/role",
    "PUT",
    { username: "test_bob", role: "editor" },
    403,
  );
  await browser().call(
    "/auth/recover",
    "POST",
    {
      username: credentials.username,
      phrase: recovery.phrase,
      password: credentials.password,
    },
    401,
  );
  const audit = await pool.query("SELECT * FROM security_audit");
  const auditJSON = JSON.stringify(audit.rows);
  assert.ok(!auditJSON.includes(recovery.phrase));
  assert.ok(!auditJSON.includes(credentials.password));
  const row = (
    await pool.query(
      "SELECT password_hash,recovery_hash FROM accounts WHERE id=$1",
      [account.id],
    )
  ).rows[0];
  assert.ok(row.password_hash.startsWith("$argon2id$"));
  assert.ok(row.recovery_hash.startsWith("$argon2id$"));
  // Test mail workflows with an injected in-memory delivery function, never real SMTP.
  await pool.query("DELETE FROM rate_buckets WHERE key LIKE 'recovery:%'");
  process.env.SMTP_HOST = "test.invalid";
  process.env.SMTP_FROM = "no-reply@example.invalid";
  process.env.EMAIL_ENCRYPTION_KEY = (await import("node:crypto"))
    .randomBytes(32)
    .toString("hex");
  const express = (await import("express")).default;
  const security = await import("../dist-server/server/security.js");
  const { auth } = await import("../dist-server/server/routes/auth.js");
  const { createEmailRoutes } =
    await import("../dist-server/server/routes/email.js");
  const mail = [];
  let deliveryFails = false;
  const emailApp = express();
  emailApp.use(
    express.json(),
    security.sessions,
    security.loadAccount,
    security.csrfSynchronisedProtection,
  );
  emailApp.use(
    "/api/auth/email",
    createEmailRoutes(async (to, subject, text) => {
      if (deliveryFails) throw new Error("Synthetic mail failure");
      mail.push({ to, subject, text });
    }),
  );
  emailApp.use("/api/auth", auth);
  emailApp.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  emailServer = emailApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => emailServer.once("listening", resolve));
  const normalBase = base;
  base = "http://127.0.0.1:" + emailServer.address().port + "/api";
  await bob.call("/auth/email/setup", "POST", { email: "bob@example.invalid" });
  assert.equal((await bob.call("/auth/email/status")).verified, false);
  const verifyCode = mail[0].text.match(/\n\n([A-Za-z0-9_-]{43})\n\n/)[1];
  await bob.call("/auth/email/verify", "POST", { code: verifyCode });
  await bob.call("/auth/email/verify", "POST", { code: verifyCode }, 400);
  assert.equal((await bob.call("/auth/email/status")).verified, true);
  deliveryFails = true;
  await bob.call(
    "/auth/email/setup",
    "POST",
    { email: "replacement@example.invalid" },
    503,
  );
  assert.deepEqual(await bob.call("/auth/email/status"), {
    verified: true,
    pending: false,
  });
  deliveryFails = false;
  assert.ok(
    !JSON.stringify(
      (await pool.query("SELECT * FROM recovery_emails")).rows,
    ).includes("bob@example.invalid"),
  );
  const emailRecoverer = browser();
  await emailRecoverer.call("/auth/email/request", "POST", {
    username: "test_bob",
  });
  const resetCode = mail[1].text.match(/\n\n([A-Za-z0-9_-]{43})\n\n/)[1];
  await emailRecoverer.call("/auth/email/recover", "POST", {
    username: "test_bob",
    code: resetCode,
    password: "email replacement test password",
  });
  await browser().call(
    "/auth/email/recover",
    "POST",
    {
      username: "test_bob",
      code: resetCode,
      password: "email replacement test password",
    },
    401,
  );
  assert.equal((await bob.call("/auth/session")).user, null);
  await emailRecoverer.call("/auth/email/", "DELETE", {});
  assert.equal(
    (await emailRecoverer.call("/auth/email/status")).verified,
    false,
  );
  base = normalBase;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  delete process.env.EMAIL_ENCRYPTION_KEY;
  await new Promise((resolve) => emailServer.close(resolve));
  emailServer = undefined;
  console.log(
    "Email recovery passed with in-memory delivery: verification, encryption, one-use codes, credential reset, session revocation and removal.",
  );
  const { chromium, expect } = await import("@playwright/test");
  chromiumBrowser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await chromiumBrowser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => console.log("Browser error:", error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const uiToken = await inviteAccount("browser.setup!", "user");
  await page.goto(process.env.APP_ORIGIN + "/activate#token=" + uiToken);
  await expect(page).toHaveURL(process.env.APP_ORIGIN + "/activate");
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  await page
    .getByLabel("New password", { exact: false })
    .fill("a private browser setup password !");
  await page
    .getByLabel("Confirm password", { exact: false })
    .fill("a private browser setup password !");
  await page
    .getByRole("button", { name: "Activate account", exact: true })
    .click();
  await expect(
    page.getByLabel("Recovery phrase", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I have saved my recovery phrase somewhere safe",
    })
    .check();
  await page.getByRole("button", { name: "Finish account setup" }).click();
  await expect(page).toHaveURL(process.env.APP_ORIGIN + "/account/security");
  await page.goto(process.env.APP_ORIGIN + "/account/entries");
  await expect(page.getByText("0 entries", { exact: true })).toBeVisible();
  const create = page.getByRole("link", { name: "Create entry", exact: true });
  await expect(create).toHaveAttribute("href", "/submit");
  await create.click();
  await expect(
    page.getByText("Your account privately owns this entry", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Browser owned fixture");
  await page
    .getByRole("textbox", { name: "Short description", exact: true })
    .fill("Created from My entries in an isolated test schema.");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await page.getByRole("link", { name: "My entries", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Edit Browser owned fixture", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create entry", exact: true }),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const header = page.getByRole("banner");
    const accountBox = await header
      .getByRole("link", { name: "Your account", exact: true })
      .boundingBox();
    const logoutBox = await header
      .getByRole("button", { name: "Sign out", exact: true })
      .boundingBox();
    assert.ok(logoutBox.x > accountBox.x);
    assert.ok(Math.abs(logoutBox.y - accountBox.y) < 2);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(process.env.APP_ORIGIN + "/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to continue", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("banner")
      .getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
  await page.goto(process.env.APP_ORIGIN + "/register");
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("browser_tester");
  await page
    .getByLabel(/^Password/)
    .fill("a browser test password long enough");
  await page
    .getByLabel("Confirm password", { exact: false })
    .fill("a browser test password long enough");
  await page
    .getByRole("button", { name: "Create a private account", exact: true })
    .click();
  await expect(
    page.getByLabel("Recovery phrase", { exact: true }),
  ).toBeVisible();
  const browserPhrase = await page
    .getByLabel("Recovery phrase", { exact: true })
    .inputValue();
  assert.equal(browserPhrase.split(" ").length, 12);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Finish account setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Account security", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add a passkey", exact: true })
    .click();
  await expect(
    page.getByText("1 passkey(s) registered.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Verify with your passkey", exact: true })
    .click();
  await expect(
    page.getByText("Passkey verified for privileged actions.", {
      exact: false,
    }),
  ).toBeVisible();
  const browserAccount = (
    await pool.query("SELECT id FROM accounts WHERE username='browser_tester'")
  ).rows[0];
  await pool.query("UPDATE accounts SET role='administrator' WHERE id=$1", [
    browserAccount.id,
  ]);
  await page.goto(process.env.APP_ORIGIN + `/listings/${anonEntry.id}/edit`);
  await page
    .getByRole("textbox", { name: "Reason for change", exact: true })
    .fill("Browser test correction");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Browser corrected listing");
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await page
    .getByLabel("Connection 1 URL")
    .fill("https://signal.group/#browser-main");
  await expect(
    page.getByRole("combobox", { name: "Connection 1 type", exact: true }),
  ).toHaveText("Signal");
  await page.getByLabel("Connection 1 label (optional)").fill("Main chat");
  await page
    .getByRole("combobox", { name: "Connection 1 placement", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Additional resource", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await page
    .getByLabel("Connection 2 URL")
    .fill("https://example.org/browser-site");
  await page
    .getByRole("button", { name: "Move connection 2 up", exact: true })
    .click();
  await expect(page.getByLabel("Connection 1 URL")).toHaveValue(
    "https://example.org/browser-site",
  );
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByText("revision 2", { exact: false })).toBeVisible();
  const browserConnections = (await anonymous.call(`/listings/${anonEntry.id}`))
    .connections;
  assert.equal(browserConnections.length, 2);
  assert.equal(browserConnections[0].type, "website");
  assert.equal(browserConnections[1].url, "https://signal.group/#browser-main");
  assert.equal(browserConnections[1].placement, "additional");
  assert.equal(new Set(browserConnections.map((item) => item.id)).size, 2);
  assert.equal(
    (await anonymous.call(`/listings/${anonEntry.id}`)).name,
    "Browser corrected listing",
  );
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Mark saved entry editor-reviewed" })
    .click();
  await expect(
    page.getByRole("img", { name: "Editor-reviewed", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Revision history" }).click();
  await page
    .getByRole("button", { name: "Preview restore of revision 1" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Reason for restore")
    .fill("Browser restore preview checked");
  await page
    .getByRole("button", { name: "Confirm restore", exact: true })
    .click();
  await expect(page.getByText("Restored as a new revision.")).toBeVisible();
  assert.equal(
    (await anonymous.call(`/listings/${anonEntry.id}`)).name,
    entry.name,
  );
  // A passkey remains usable after an ordinary logout.
  await page.goto(process.env.APP_ORIGIN + "/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to continue", exact: true }),
  ).toBeVisible();
  await page.goto(process.env.APP_ORIGIN + "/login");
  await page
    .getByRole("button", { name: "Sign in with a passkey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  console.log(
    "Browser auth passed: signup/recovery display, virtual passkey registration and sign-in, privileged editing, review badge, restore preview and logout.",
  );
  const bobId = (
    await pool.query("SELECT id FROM accounts WHERE username='test_bob'")
  ).rows[0].id;
  await pool.query(
    "INSERT INTO passkeys(id,account_id,public_key,counter) VALUES ('test-authorization-fixture',$1,$2,0)",
    [bobId, Buffer.from([1])],
  );
  await pool.query("UPDATE accounts SET recovery_saved=true WHERE id=$1", [
    bobId,
  ]);
  const assignRole = async (role) => {
    const csrf = (
      await (
        await page.request.get(process.env.APP_ORIGIN + "/api/auth/csrf")
      ).json()
    ).token;
    const response = await page.request.put(
      process.env.APP_ORIGIN + "/api/admin/role",
      {
        headers: { "x-csrf-token": csrf },
        data: { username: "test_bob", role },
      },
    );
    assert.equal(response.status(), 200, await response.text());
  };
  await assignRole("editor");
  const editor = browser();
  await editor.call("/auth/login", "POST", {
    username: "test_bob",
    password: "email replacement test password",
  });
  assert.equal((await editor.call("/auth/session")).user.role, "editor");
  await editor.call("/listings/manage?all=true", "GET", undefined, 403);
  await pool.query(
    "UPDATE sessions SET sess=jsonb_set(sess::jsonb,'{strongAt}',to_jsonb($1::bigint)) WHERE sess->>'accountId'=$2",
    [Date.now(), bobId],
  );
  assert.ok((await editor.call("/listings/manage?all=true")).total > 0);
  await editor.call(
    "/admin/role",
    "PUT",
    { username: "test_alice", role: "editor" },
    403,
  );
  assert.deepEqual((await editor.call("/account/saved")).ids, []);
  await assignRole("user");
  assert.equal((await editor.call("/auth/session")).user, null);
  console.log(
    "Role assignment passed: administrator grant/revoke, editor passkey gate, no editor privilege escalation, immediate session invalidation.",
  );
  console.log(
    "Auth integration passed: anonymous browsing/submission, CSRF, private ownership, scoped object access, badges, conflicts, history/restore, private cross-device bookmarks, publication policy, session invalidation and staff recovery suspension.",
  );
} finally {
  if (emailServer) await new Promise((resolve) => emailServer.close(resolve));
  if (chromiumBrowser) await chromiumBrowser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (store) store.close();
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}

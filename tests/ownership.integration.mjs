// Run: node --import tsx tests/ownership.integration.mjs
// Only disposable schema fixtures are mutated; never imports the live server entry point.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import { ZodError } from "zod";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL for tests.");
const schema = "ownership_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: url });
const scoped = new URL(url);
scoped.searchParams.set("options", "-c search_path=" + schema);
scoped.searchParams.set("application_name", schema);
process.env.DATABASE_URL = scoped.toString();
process.env.DATABASE_SCHEMA = schema;
process.env.START_SERVER = "false";
process.env.STAFF_AUTH_MODE = "password_recent";
process.env.PASSKEYS_ENABLED = "false";
process.env.APP_ORIGIN = "http://localhost:4350";
process.env.SESSION_SECRET = randomUUID() + randomUUID();
const password = "isolated ownership fixture password";
let pool, store, server;
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  ({ pool } = await import("../server/db.ts"));
  await pool.query(await readFile("db/init/001_schema.sql", "utf8"));
  // Explicit migration list keeps this fixture independent of other work items/wiring.
  for (const name of [
    "002_event_sync",
    "003_accounts",
    "004_account_setup",
    "005_connections",
    "006_connection_revisions",
    "007_entry_context",
    "008_joining_placeholders",
    "009_publications",
    "010_tags",
    "011_ownership",
    "016_external_owner",
  ]) {
    await pool.query(await readFile(`db/migrations/${name}.sql`, "utf8"));
  }
  const security = await import("../server/security.ts");
  store = security.sessionStore;
  const { auth } = await import("../server/routes/auth.ts");
  const { listings } = await import("../server/routes/listings.ts");
  const { accountRoutes } = await import("../server/routes/accounts.ts");
  const { tags } = await import("../server/routes/tags.ts");
  const { ownership } = await import("../server/routes/ownership.ts");
  const { hashSecret } = await import("../server/credentials.ts");
  const { ownershipInboxSchema, ownershipAssignmentSchema } =
    await import("../shared/ownership.ts");
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    security.sessions,
    security.loadAccount,
    security.checkOrigin,
    security.csrfSynchronisedProtection,
  );
  app.use("/api/auth", auth);
  app.use("/api/listings", listings);
  app.use("/api/account", accountRoutes);
  app.use("/api/tags", tags);
  app.use("/api/ownership", ownership);
  const unexpected = [];
  app.use((error, _req, res, _next) => {
    const status =
      error instanceof security.HttpError
        ? error.status
        : error instanceof ZodError
          ? 400
          : error.code === "EBADCSRFTOKEN"
            ? 403
            : 500;
    if (status === 500) unexpected.push(error);
    res.status(status).json({
      error: status === 500 ? "Unexpected fixture failure" : error.message,
    });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  function browser() {
    let cookie = "";
    return {
      get cookie() {
        return cookie;
      },
      async call(
        path,
        method = "GET",
        body,
        expected = 200,
        csrf = true,
        extraHeaders = {},
      ) {
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
            ...extraHeaders,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.headers.get("set-cookie"))
          cookie = response.headers.get("set-cookie").split(";")[0];
        const data = await response.json();
        assert.ok(
          [expected].flat().includes(response.status),
          `${method} ${path}: ${response.status} ${JSON.stringify(data)}`,
        );
        // CSRF/origin failures happen in inherited middleware before this router.
        if (path.startsWith("/ownership") && csrf && !extraHeaders.Origin)
          assert.equal(response.headers.get("cache-control"), "no-store");
        return expected instanceof Array
          ? { status: response.status, data }
          : data;
      },
    };
  }
  const hash = await hashSecret(password);
  async function account(username, role = "user", recoverySaved = false) {
    const { rows } = await pool.query(
      "INSERT INTO accounts(username,password_hash,recovery_hash,role,recovery_saved) VALUES ($1,$2,$2,$3,$4) RETURNING id",
      [username, hash, role, recoverySaved],
    );
    const agent = browser();
    const login = () =>
      agent.call("/auth/login", "POST", { username, password });
    await login();
    return { id: rows[0].id, username, agent, login };
  }
  const editor = await account("fixture.editor", "editor", true);
  const administrator = await account("fixture.admin", "administrator", true);
  const owner = await account("fixture.owner");
  const recipient = await account("fixture.recipient");
  const outsider = await account("fixture.outsider");
  const anonymous = browser();
  const listing = async (ownerId = owner.id, status = "published") =>
    (
      await pool.query(
        `INSERT INTO listings(kind,name,summary,status,owner_id,self_confirmed_at,editor_reviewed_at,last_confirmed_at)
     VALUES ('group','Ownership fixture','Temporary disposable entry',$1,$2,now(),now(),now()) RETURNING *`,
        [status, ownerId],
      )
    ).rows[0];
  const row = async (id) =>
    (await pool.query("SELECT * FROM listings WHERE id=$1", [id])).rows[0];
  const state = async (id) =>
    (
      await pool.query("SELECT state FROM ownership_transfers WHERE id=$1", [
        id,
      ])
    ).rows[0].state;
  const nominate = async (
    entry,
    staff = editor,
    target = recipient,
    expected = 201,
  ) =>
    staff.agent.call(
      `/ownership/listings/${entry.id}`,
      "POST",
      {
        username: target.username.toUpperCase(),
        version: entry.version,
        reason: "Assign fixture maintenance",
      },
      expected,
    );
  const accept = (offer, who = recipient, expected = 200) =>
    who.agent.call(`/ownership/${offer.id}/accept`, "POST", {}, expected);
  const changeSession = (id, field, value) =>
    pool.query(
      "UPDATE sessions SET sess=jsonb_set(sess::jsonb,ARRAY[$2::text],to_jsonb($3::bigint)) WHERE sess->>'accountId'=$1",
      [id, field, value],
    );
  const entry = await listing();
  for (const agent of [
    anonymous,
    owner.agent,
    recipient.agent,
    outsider.agent,
  ]) {
    const status = agent === anonymous ? 401 : 403;
    await agent.call(
      `/ownership/listings/${entry.id}`,
      "GET",
      undefined,
      status,
    );
    await agent.call(
      `/ownership/listings/${entry.id}`,
      "POST",
      { username: recipient.username, version: 1, reason: "Try self claim" },
      status,
    );
  }
  await anonymous.call("/ownership/inbox", "GET", undefined, 401);
  await editor.agent.call(
    `/ownership/listings/${entry.id}`,
    "POST",
    {},
    403,
    false,
  );
  await editor.agent.call(
    `/ownership/listings/${entry.id}`,
    "POST",
    {},
    403,
    true,
    { Origin: "https://elsewhere.invalid" },
  );
  await nominate(entry, editor, { username: "fixture.%" }, 404);
  await nominate(entry, editor, owner, 409);
  await nominate({ ...entry, version: 999 }, editor, recipient, 409);
  await editor.agent.call(
    `/ownership/listings/${entry.id}`,
    "POST",
    { username: recipient.username, version: 1, reason: "" },
    400,
  );
  const offer = await nominate(entry);
  const timing = (
    await pool.query(
      "SELECT extract(epoch FROM (expires_at-created_at)) AS seconds FROM ownership_transfers WHERE id=$1",
      [offer.id],
    )
  ).rows[0];
  assert.ok(Math.abs(Number(timing.seconds) - 7 * 86400) < 1);
  await nominate(entry, administrator, outsider, 409);
  const staffView = ownershipAssignmentSchema.parse(
    await editor.agent.call(`/ownership/listings/${entry.id}`),
  );
  assert.equal(staffView.ownerUsername, owner.username);
  assert.equal(staffView.pending.recipientUsername, recipient.username);
  const inbox = ownershipInboxSchema.parse(
    await recipient.agent.call("/ownership/inbox"),
  );
  assert.equal(inbox.items[0].id, offer.id);
  assert.equal((await outsider.agent.call("/ownership/inbox")).total, 0);
  for (const privateName of [
    owner.username,
    editor.username,
    recipient.username,
  ])
    assert.ok(!JSON.stringify(inbox).includes(privateName));
  assert.equal((await row(entry.id)).owner_id, owner.id);
  assert.equal((await row(entry.id)).version, 1);
  assert.equal(
    (await recipient.agent.call(`/listings/${entry.id}/permissions`)).canEdit,
    false,
  );
  assert.equal(
    (await owner.agent.call(`/listings/${entry.id}/permissions`)).canConfirm,
    true,
  );
  await recipient.agent.call(
    `/listings/${entry.id}/edit`,
    "GET",
    undefined,
    403,
  );
  await recipient.agent.call(
    `/listings/${entry.id}/action`,
    "POST",
    { version: 1, action: "confirm", reason: "No pending authority" },
    403,
  );
  await recipient.agent.call(
    `/listings/${entry.id}/restore`,
    "POST",
    { version: 1, targetVersion: 1, reason: "No claim by restore" },
    403,
  );
  const publicEntry = await anonymous.call(`/listings/${entry.id}`);
  assert.equal("owner_id" in publicEntry, false);
  assert.equal("ownership" in publicEntry, false);
  assert.ok(!JSON.stringify(publicEntry).includes(recipient.id));
  await accept(offer, outsider, 404);
  await accept(offer, editor, 404);
  for (const action of ["accept", "decline", "cancel"]) {
    const who = action === "cancel" ? editor : recipient;
    await who.agent.call(
      `/ownership/${offer.id}/${action}`,
      "POST",
      {},
      403,
      false,
    );
  }
  await recipient.agent.call(`/ownership/${offer.id}/cancel`, "POST", {}, 403);
  await changeSession(
    recipient.id,
    "passwordAuthenticatedAt",
    Date.now() - 16 * 60000,
  );
  await accept(offer, recipient, 403);
  await changeSession(
    recipient.id,
    "passwordAuthenticatedAt",
    Date.now() + 60000,
  );
  await accept(offer, recipient, 403);
  assert.equal(await state(offer.id), "pending");
  await recipient.agent.call("/auth/reauthenticate", "POST", { password });
  // A proposal remains valid beyond the proposer's 15-minute verification window.
  await changeSession(
    editor.id,
    "passwordAuthenticatedAt",
    Date.now() - 16 * 60000,
  );
  await accept(offer);
  assert.equal(await state(offer.id), "accepted");
  const accepted = await row(entry.id);
  assert.equal(accepted.owner_id, recipient.id);
  assert.equal(accepted.version, 2);
  assert.equal(accepted.locally_edited, true);
  assert.equal(accepted.self_confirmed_at, null);
  assert.equal(accepted.editor_reviewed_at, null);
  assert.equal(accepted.last_confirmed_at, null);
  assert.equal(
    (await recipient.agent.call("/auth/session")).user.recoverySaved,
    false,
  );
  assert.equal((await recipient.agent.call("/auth/session")).user.role, "user");
  await accept(offer, recipient, 409);
  await owner.agent.call(`/listings/${entry.id}/edit`, "GET", undefined, 403);
  await recipient.agent.call(`/listings/${entry.id}/edit`);
  const revision = (
    await pool.query(
      "SELECT * FROM listing_revisions WHERE listing_id=$1 AND version=2",
      [entry.id],
    )
  ).rows[0];
  assert.equal(revision.actor_id, recipient.id);
  assert.equal(revision.action, "ownership.accepted");
  assert.equal(revision.before_data.owner_id, owner.id);
  assert.equal(revision.after_data.owner_id, recipient.id);
  const audit = (
    await pool.query(
      "SELECT actor_id,action FROM ownership_audit WHERE transfer_id=$1 ORDER BY id",
      [offer.id],
    )
  ).rows;
  assert.deepEqual(audit, [
    { actor_id: editor.id, action: "proposed" },
    { actor_id: recipient.id, action: "accepted" },
  ]);
  await editor.agent.call("/auth/reauthenticate", "POST", { password });
  await editor.agent.call(`/listings/${entry.id}/restore`, "POST", {
    version: 2,
    targetVersion: 1,
    reason: "Restore content only",
  });
  assert.equal((await row(entry.id)).owner_id, recipient.id);
  console.log(
    "Ownership: authenticated consent, prior-owner rights, privacy, CSRF, audit and content-restore isolation passed.",
  );

  for (const action of ["decline", "cancel"]) {
    const item = await listing();
    const invitation = await nominate(item);
    const actor = action === "decline" ? recipient : administrator;
    await actor.agent.call(`/ownership/${invitation.id}/${action}`, "POST");
    assert.equal(
      await state(invitation.id),
      action === "decline" ? "declined" : "cancelled",
    );
    await accept(invitation, recipient, 409);
    assert.equal((await row(item.id)).owner_id, owner.id);
    await nominate(item);
  }
  const expire = async (id) =>
    pool.query(
      "UPDATE ownership_transfers SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
      [id],
    );
  const expiredEntry = await listing();
  const expired = await nominate(expiredEntry);
  await expire(expired.id);
  assert.equal(
    (await editor.agent.call(`/ownership/listings/${expiredEntry.id}`)).pending,
    null,
  );
  assert.equal(
    (await recipient.agent.call("/ownership/inbox")).items.find(
      (i) => i.id === expired.id,
    ).state,
    "expired",
  );
  await accept(expired, recipient, 409);
  assert.equal(await state(expired.id), "expired");
  const expiredAgain = await nominate(expiredEntry);
  await expire(expiredAgain.id);
  await nominate(expiredEntry); // Lazily expires the old row before using the unique pending slot.
  assert.equal(await state(expiredAgain.id), "expired");

  // Direct fixture mutations model host account/entry changes without touching real records.
  for (const change of [
    "role='user'",
    "role='administrator'",
    "privileges_suspended=true",
    "recovery_saved=false",
    "session_version=session_version+1",
  ]) {
    const item = await listing();
    const invitation = await nominate(item);
    await pool.query(`UPDATE accounts SET ${change} WHERE id=$1`, [editor.id]);
    await accept(invitation, recipient, 409);
    assert.equal(await state(invitation.id), "revoked");
    assert.equal((await row(item.id)).owner_id, owner.id);
    await pool.query(
      "UPDATE accounts SET role='editor',privileges_suspended=false,recovery_saved=true WHERE id=$1",
      [editor.id],
    );
    await editor.login();
  }
  for (const change of [
    "status='archived'",
    "owner_id=NULL",
    "summary='Content changed'",
  ]) {
    const item = await listing();
    const invitation = await nominate(item);
    await pool.query(`UPDATE listings SET ${change} WHERE id=$1`, [item.id]);
    await accept(invitation, recipient, 409);
    assert.equal(await state(invitation.id), "revoked");
    assert.notEqual((await row(item.id)).owner_id, recipient.id);
  }
  const staleRecipientEntry = await listing();
  const staleRecipient = await nominate(staleRecipientEntry);
  await pool.query(
    "UPDATE accounts SET session_version=session_version+1 WHERE id=$1",
    [recipient.id],
  );
  await accept(staleRecipient, recipient, 401);
  assert.equal(await state(staleRecipient.id), "pending");
  await recipient.login();
  await accept(staleRecipient);
  await pool.query("UPDATE accounts SET recovery_saved=false WHERE id=$1", [
    editor.id,
  ]);
  await nominate(await listing(), editor, recipient, 403);
  await pool.query("UPDATE accounts SET recovery_saved=true WHERE id=$1", [
    editor.id,
  ]);
  await changeSession(
    editor.id,
    "passwordAuthenticatedAt",
    Date.now() - 16 * 60000,
  );
  await nominate(await listing(), editor, recipient, 403);
  await editor.login();
  process.env.STAFF_AUTH_MODE = "passkey";
  await nominate(await listing(), editor, recipient, 403);
  await changeSession(editor.id, "strongAt", Date.now());
  const passkeyOffer = await nominate(await listing());
  await accept(passkeyOffer); // Ordinary recipients do not need staff passkeys/recovery.
  process.env.STAFF_AUTH_MODE = "password_recent";
  // New session-only policy: aged staff and recipient sessions remain usable.
  process.env.STAFF_AUTH_MODE = "session";
  await changeSession(
    editor.id,
    "passwordAuthenticatedAt",
    Date.now() - 86400000,
  );
  await changeSession(
    recipient.id,
    "passwordAuthenticatedAt",
    Date.now() - 86400000,
  );
  const sessionEntry = await listing();
  for (const agent of [anonymous, owner.agent, recipient.agent]) {
    const denied = agent === anonymous ? 401 : 403;
    await agent.call("/ownership/candidates", "GET", undefined, denied);
    await agent.call(
      `/ownership/listings/${sessionEntry.id}/no-account`,
      "POST",
      {
        version: sessionEntry.version,
        label: "Private alias",
        reason: "Unauthorized attempt",
      },
      denied,
    );
  }
  const candidates = await editor.agent.call(
    "/ownership/candidates?q=FIXTURE.RECIPIENT",
  );
  assert.equal(candidates.total, 1);
  assert.deepEqual(Object.keys(candidates.items[0]).sort(), [
    "alias",
    "id",
    "username",
  ]);
  assert.equal(
    (await editor.agent.call("/ownership/candidates?q=%25")).total,
    0,
  );
  await editor.agent.call(
    "/ownership/candidates?page=0",
    "GET",
    undefined,
    400,
  );
  const sessionOffer = await nominate(sessionEntry);
  await editor.agent.call(
    `/ownership/listings/${sessionEntry.id}/no-account`,
    "POST",
    {
      version: sessionEntry.version,
      label: "Private alias",
      reason: "Cannot bypass pending consent",
    },
    409,
  );
  await accept(sessionOffer);
  const owned = await row(sessionEntry.id);
  assert.equal(owned.owner_id, recipient.id);
  await editor.agent.call(`/listings/${owned.id}/edit`);
  const body = {
    version: owned.version,
    label: "Fixture manager alias",
    reason: "No account manager requested staff maintenance",
  };
  await editor.agent.call(
    `/ownership/listings/${owned.id}/no-account`,
    "POST",
    body,
    403,
    false,
  );
  await editor.agent.call(
    `/ownership/listings/${owned.id}/no-account`,
    "POST",
    { ...body, version: 999 },
    409,
  );
  await editor.agent.call(
    `/ownership/listings/${owned.id}/no-account`,
    "POST",
    body,
  );
  const external = await row(owned.id);
  assert.equal(external.owner_id, null);
  assert.equal(external.external_owner_label, body.label);
  assert.equal(external.version, owned.version + 1);
  assert.equal(external.self_confirmed_at, null);
  assert.equal(external.editor_reviewed_at, null);
  assert.equal(
    (await recipient.agent.call(`/listings/${owned.id}/permissions`)).canEdit,
    false,
  );
  assert.equal(
    (await editor.agent.call(`/listings/${owned.id}/permissions`)).canEdit,
    true,
  );
  assert.ok(
    !JSON.stringify(await anonymous.call(`/listings/${owned.id}`)).includes(
      body.label,
    ),
  );
  assert.equal(
    (await editor.agent.call(`/ownership/listings/${owned.id}`))
      .externalOwnerLabel,
    body.label,
  );
  const privateRevision = (
    await pool.query(
      "SELECT action,actor_id FROM listing_revisions WHERE listing_id=$1 AND version=$2",
      [owned.id, external.version],
    )
  ).rows[0];
  assert.equal(privateRevision.action, "ownership.no-account");
  assert.equal(privateRevision.actor_id, editor.id);
  await accept(await nominate(external));
  assert.equal((await row(owned.id)).external_owner_label, null);
  process.env.STAFF_AUTH_MODE = "password_recent";
  await editor.login();
  await recipient.login();
  for (const status of ["published", "pending_review", "archived"]) {
    const item = await listing(null, status);
    await nominate(item, owner, recipient, 403); // No anonymous self-claim.
    const invitation = await nominate(item, administrator);
    await accept(invitation);
    assert.equal((await row(item.id)).status, status);
  }
  const staffOwned = await listing(editor.id);
  await accept(await nominate(staffOwned, administrator));
  assert.equal(
    (await editor.agent.call(`/listings/${staffOwned.id}/permissions`)).canEdit,
    true,
  );
  assert.equal(
    (await editor.agent.call(`/listings/${staffOwned.id}/permissions`))
      .canConfirm,
    false,
  );
  console.log(
    "Ownership: decline/cancel/expiry, stale entry/session, staff revocation, authentication policies and unowned entries passed.",
  );

  const raceEntry = await listing();
  const nominations = await Promise.all([
    nominate(raceEntry, editor, recipient, [201, 409]),
    nominate(raceEntry, administrator, recipient, [201, 409]),
  ]);
  assert.deepEqual(nominations.map((r) => r.status).sort(), [201, 409]);
  const raceOffer = nominations.find((r) => r.status === 201).data;
  const duplicate = await Promise.all([
    accept(raceOffer, recipient, [200, 409]),
    accept(raceOffer, recipient, [200, 409]),
  ]);
  assert.deepEqual(duplicate.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await row(raceEntry.id)).version, 2);
  const cancelledRaceEntry = await listing();
  const cancelledRace = await nominate(cancelledRaceEntry);
  const cancelRace = await Promise.all([
    accept(cancelledRace, recipient, [200, 409]),
    administrator.agent.call(
      `/ownership/${cancelledRace.id}/cancel`,
      "POST",
      {},
      [200, 409],
    ),
  ]);
  assert.deepEqual(cancelRace.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await row(cancelledRaceEntry.id)).owner_id,
    cancelRace[0].status === 200 ? recipient.id : owner.id,
  );

  // Deterministically hold revocation/edit locks until the ownership request waits.
  async function duringLockedRequest(target, editSql, params, request) {
    const blocker = await pool.connect();
    let pending;
    try {
      await blocker.query("BEGIN");
      const pid = (await blocker.query("SELECT pg_backend_pid() AS pid"))
        .rows[0].pid;
      await blocker.query(`SELECT id FROM ${target} WHERE id=$1 FOR UPDATE`, [
        params[0],
      ]);
      // The request obtains CSRF normally, then blocks on the mutation's row lock.
      pending = request();
      const until = Date.now() + 5000;
      while (true) {
        const waiting = await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND $2=ANY(pg_blocking_pids(pid))",
          [schema, pid],
        );
        if (waiting.rowCount) break;
        assert.ok(
          Date.now() < until,
          "Ownership request did not wait for the fixture lock",
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await blocker.query(editSql, params);
      await blocker.query("COMMIT");
      await pending;
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      if (pending) await pending;
    }
  }
  const revocationRace = await nominate(await listing());
  await duringLockedRequest(
    "accounts",
    "UPDATE accounts SET session_version=session_version+1 WHERE id=$1",
    [editor.id],
    () => accept(revocationRace, recipient, 409),
  );
  assert.equal(await state(revocationRace.id), "revoked");
  await editor.login();
  const editRaceEntry = await listing();
  const editRace = await nominate(editRaceEntry);
  await duringLockedRequest(
    "listings",
    "UPDATE listings SET summary='Concurrent edit' WHERE id=$1",
    [editRaceEntry.id],
    () => accept(editRace, recipient, 409),
  );
  assert.equal(await state(editRace.id), "revoked");
  const recipientRace = await nominate(await listing());
  await duringLockedRequest(
    "accounts",
    "UPDATE accounts SET session_version=session_version+1 WHERE id=$1",
    [recipient.id],
    () => accept(recipientRace, recipient, 401),
  );
  assert.equal(await state(recipientRace.id), "pending");
  const nominationEditRace = await listing();
  await duringLockedRequest(
    "accounts",
    "UPDATE listings SET summary='Owner edit concurrent with nomination' WHERE owner_id=$1 AND id=$2",
    [owner.id, nominationEditRace.id],
    () => nominate(nominationEditRace, editor, recipient, 409),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM ownership_transfers WHERE listing_id=$1",
        [nominationEditRace.id],
      )
    ).rows[0].n,
    0,
  );
  const automaticAudit = (
    await pool.query(
      "SELECT actor_id,cause FROM ownership_audit WHERE transfer_id=$1 AND action='revoked'",
      [revocationRace.id],
    )
  ).rows[0];
  assert.equal(automaticAudit.actor_id, null);
  assert.equal(automaticAudit.cause, "proposer_changed");
  const logs = JSON.stringify(
    (
      await pool.query(
        "SELECT row_to_json(a) FROM ownership_audit a UNION ALL SELECT row_to_json(s) FROM security_audit s",
      )
    ).rows,
  );
  assert.ok(!logs.includes(password));
  assert.ok(!logs.includes(hash));
  assert.ok(!logs.includes(editor.username));
  assert.deepEqual(unexpected, []);
  console.log(
    "Ownership integration passed: unique pending and acceptance/cancel/revocation/edit/session races; no secrets in audit.",
  );
  if (process.env.OWNERSHIP_BROWSER === "1") {
    process.env.STAFF_AUTH_MODE = "session";
    await changeSession(
      editor.id,
      "passwordAuthenticatedAt",
      Date.now() - 86400000,
    );
    const previewRecipient = await account("preview.maintainer");
    const previewEntry = (
      await pool.query(
        `INSERT INTO listings(kind,name,summary,description,location,status,owner_id)
       VALUES ('group','Concord Makers Exchange','A neighborhood group for sharing practical skills and creative projects.',
       'A fictional directory entry used only in an isolated ownership acceptance preview.','Concord','published',$1) RETURNING id`,
        [owner.id],
      )
    ).rows[0];
    const { runOwnershipPreview } = await import("./ownership.browser.mjs");
    await runOwnershipPreview({
      apiBase: base,
      staffCookie: editor.agent.cookie,
      recipientCookie: previewRecipient.agent.cookie,
      entryId: previewEntry.id,
      recipientUsername: previewRecipient.username,
    });
    assert.equal((await row(previewEntry.id)).owner_id, previewRecipient.id);
    assert.deepEqual(unexpected, []);
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (store) store.close();
  if (pool) await pool.end();
  if (created) {
    assert.match(schema, /^ownership_test_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  }
  await admin.end();
}

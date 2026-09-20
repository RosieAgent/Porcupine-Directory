// Disposable database schema; no real accounts, roles or inbox messages are changed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL for tests.");
const schema = "staff_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: url });
const scoped = new URL(url);
scoped.searchParams.set("options", "-c search_path=" + schema);
Object.assign(process.env, {
  DATABASE_URL: scoped.toString(),
  DATABASE_SCHEMA: schema,
  START_SERVER: "false",
  FSP_SYNC_ENABLED: "false",
  PUBLICATION_SYNC_ENABLED: "false",
  PASSKEYS_ENABLED: "false",
  STAFF_AUTH_MODE: "password_recent",
  APP_ORIGIN: "http://localhost:4351",
  SESSION_SECRET: randomUUID() + randomUUID(),
});
let pool, server, store;
const password = "private fixture password !@#$";
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  ({ pool } = await import("../dist-server/server/db.js"));
  await pool.query(await readFile("db/init/001_schema.sql", "utf8"));
  const { app } = await import("../dist-server/server/index.js");
  ({ sessionStore: store } = await import("../dist-server/server/security.js"));
  const { inviteAccount } =
    await import("../dist-server/server/setup-account.js");
  server = app.listen(4351, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:4351/api";
  function browser() {
    let cookie = "";
    return {
      async call(path, method = "GET", body, expected = 200) {
        const headers = { cookie, "Content-Type": "application/json" };
        if (method !== "GET") {
          const r = await fetch(base + "/auth/csrf", { headers: { cookie } });
          cookie = r.headers.get("set-cookie")?.split(";")[0] || cookie;
          headers.cookie = cookie;
          headers["X-CSRF-Token"] = (await r.json()).token;
        }
        const r = await fetch(base + path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        cookie = r.headers.get("set-cookie")?.split(";")[0] || cookie;
        const data = await r.json();
        assert.equal(
          r.status,
          expected,
          `${method} ${path}: ${JSON.stringify(data)}`,
        );
        return data;
      },
    };
  }
  const owner = browser(),
    editor = browser(),
    anon = browser();
  const token = await inviteAccount("fixture.admin", "administrator");
  const activation = await owner.call("/auth/activate", "POST", {
    token,
    password,
  });
  await owner.call("/admin/users", "GET", undefined, 403);
  await owner.call("/auth/recovery/saved", "POST");
  await owner.call("/admin/users", "GET", undefined, 403); // activation isn't a password login
  await owner.call(
    "/auth/reauthenticate",
    "POST",
    { password: "incorrect" },
    401,
  );
  await owner.call("/auth/reauthenticate", "POST", { password });
  const session = await owner.call("/auth/session");
  assert.equal(session.user.staffVerified, true);
  assert.equal(session.user.strong, false); // do not misrepresent password as a passkey
  await owner.call("/auth/passkeys/login/options", "POST", {}, 404);
  const list = await owner.call("/admin/users");
  assert.equal(list.total, 1);
  assert.deepEqual(Object.keys(list.items[0]).sort(), [
    "id",
    "privilegesSuspended",
    "recoverySaved",
    "role",
    "setupPending",
    "username",
  ]);
  await anon.call("/admin/users", "GET", undefined, 403);
  await editor.call(
    "/auth/signup",
    "POST",
    { username: "fixture.editor", password },
    201,
  );
  await editor.call("/auth/recovery/saved", "POST");
  await owner.call("/admin/role", "PUT", {
    username: "fixture.editor",
    role: "editor",
  });
  await editor.call("/listings/manage?all=true", "GET", undefined, 401);
  await editor.call("/auth/login", "POST", {
    username: "fixture.editor",
    password,
  });
  await editor.call("/listings/manage?all=true");
  await editor.call("/admin/users", "GET", undefined, 403);
  await editor.call(
    "/admin/role",
    "PUT",
    { username: "fixture.admin", role: "user" },
    403,
  );
  await pool.query(
    "UPDATE sessions SET sess=jsonb_set(sess::jsonb,'{passwordAuthenticatedAt}',to_jsonb($1::bigint))::json WHERE sess->>'accountId'=$2",
    [Date.now() - 16 * 60000, session.user.id],
  );
  await owner.call("/admin/users", "GET", undefined, 403);
  await owner.call("/auth/reauthenticate", "POST", { password });
  assert.equal((await owner.call("/admin/users?q=FIXTURE.ADMIN")).total, 1);
  await owner.call("/admin/users?page=0", "GET", undefined, 400);
  const freshBefore = (
    await pool.query("SELECT sess FROM sessions WHERE sess->>'accountId'=$1", [
      session.user.id,
    ])
  ).rows[0].sess.passwordAuthenticatedAt;
  await owner.call("/admin/users");
  assert.equal(
    (
      await pool.query(
        "SELECT sess FROM sessions WHERE sess->>'accountId'=$1",
        [session.user.id],
      )
    ).rows[0].sess.passwordAuthenticatedAt,
    freshBefore,
  );
  await owner.call("/auth/recover", "POST", {
    username: "fixture.admin",
    phrase: activation.phrase,
    password,
  });
  await owner.call("/auth/recovery/saved", "POST");
  await owner.call("/auth/reauthenticate", "POST", { password });
  await owner.call("/admin/users", "GET", undefined, 403);
  assert.equal(
    (await owner.call("/auth/session")).user.privilegesSuspended,
    true,
  );
  if (process.env.TEST_MAILPIT_API) {
    const mailer = browser();
    const email = `fixture-${randomUUID()}@example.invalid`;
    await mailer.call(
      "/auth/signup",
      "POST",
      { username: "fixture.mailer", password },
      201,
    );
    await mailer.call("/auth/email/setup", "POST", { email });
    async function mailCode(subject) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const response = await fetch(
          `${process.env.TEST_MAILPIT_API}/api/v1/search?query=${encodeURIComponent("to:" + email)}`,
        );
        assert.equal(response.status, 200);
        const list = await response.json();
        const message = list.messages.find(
          (item) =>
            item.Subject === subject &&
            item.To.some((to) => to.Address === email),
        );
        if (message) {
          const full = await (
            await fetch(
              `${process.env.TEST_MAILPIT_API}/api/v1/message/${message.ID}`,
            )
          ).json();
          const code = full.Text.match(/\b[A-Za-z0-9_-]{43}\b/)?.[0];
          assert.ok(
            code,
            "Expected a private recovery code in the fixture message",
          );
          return code;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Preview fixture message not delivered");
    }
    await mailer.call("/auth/email/verify", "POST", {
      code: await mailCode("Confirm Porcupine Directory recovery email"),
    });
    assert.equal((await mailer.call("/auth/email/status")).verified, true);
    await anon.call("/auth/email/request", "POST", {
      username: "fixture.mailer",
    });
    const code = await mailCode("Porcupine Directory account recovery");
    const recovered = await anon.call("/auth/email/recover", "POST", {
      username: "fixture.mailer",
      code,
      password,
    });
    assert.equal(recovered.phrase.split(" ").length, 12);
    await anon.call(
      "/auth/email/recover",
      "POST",
      { username: "fixture.mailer", code, password },
      401,
    );
    console.log(
      "PASS: real local SMTP verification and one-use email recovery through Mailpit; fixture messages expire within one hour.",
    );
  }
  console.log(
    "PASS: private admin activation, password-only staff verification, expiry, user view privacy, editor grant/session revocation, role isolation and recovery suspension.",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (store) store.close();
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  recentlyVerified,
  assertStaff,
  assertRecent,
} from "../dist-server/server/security.js";
import {
  emailPreviewEnabled,
  createMailTransport,
} from "../dist-server/server/routes/email.js";

test("fresh verification has strict expiry and rejects future/non-finite dates", () => {
  const now = Date.now();
  assert.equal(recentlyVerified(now, 15, now), true);
  assert.equal(recentlyVerified(now - 15 * 60000, 15, now), false);
  for (const value of [undefined, NaN, Infinity, now + 1])
    assert.equal(recentlyVerified(value, 15, now), false);
});
test("password policy requires server timestamp, role, saved recovery and no suspension", () => {
  const previous = process.env.STAFF_AUTH_MODE;
  process.env.STAFF_AUTH_MODE = "password_recent";
  try {
    const req = {
      account: {
        role: "administrator",
        recoverySaved: true,
        privilegesSuspended: false,
        strong: true,
        staffVerified: true,
      },
      session: {},
    };
    assert.throws(() => assertStaff(req, true));
    req.session.passwordAuthenticatedAt = Date.now();
    assert.doesNotThrow(() => assertStaff(req, true));
    req.account.privilegesSuspended = true;
    assert.throws(() => assertStaff(req, true));
    req.account.privilegesSuspended = false;
    req.account.recoverySaved = false;
    assert.throws(() => assertStaff(req, true));
    req.account.recoverySaved = true;
    req.account.role = "user";
    assert.throws(() => assertStaff(req));
    req.account.role = "editor";
    assert.throws(() => assertStaff(req, true));
    assert.doesNotThrow(() => assertStaff(req));
    process.env.STAFF_AUTH_MODE = "typo";
    assert.throws(() => assertStaff(req));
  } finally {
    if (previous === undefined) delete process.env.STAFF_AUTH_MODE;
    else process.env.STAFF_AUTH_MODE = previous;
  }
});
test("session staff policy removes the edit timer but preserves roles, suspension, recovery and security-change freshness", () => {
  const previous = process.env.STAFF_AUTH_MODE;
  process.env.STAFF_AUTH_MODE = "session";
  try {
    const req = {
      account: {
        role: "editor",
        recoverySaved: true,
        privilegesSuspended: false,
      },
      session: {
        authenticatedAt: Date.now() - 86400000,
        passwordAuthenticatedAt: Date.now() - 86400000,
      },
    };
    assert.doesNotThrow(() => assertStaff(req));
    assert.throws(() => assertStaff(req, true));
    assert.throws(() => assertRecent(req));
    req.account.role = "administrator";
    assert.doesNotThrow(() => assertStaff(req, true));
    req.account.privilegesSuspended = true;
    assert.throws(() => assertStaff(req));
    req.account.privilegesSuspended = false;
    req.account.recoverySaved = false;
    assert.throws(() => assertStaff(req));
    req.account.recoverySaved = true;
    req.account.role = "user";
    assert.throws(() => assertStaff(req));
    req.account = undefined;
    assert.throws(() => assertStaff(req));
  } finally {
    if (previous === undefined) delete process.env.STAFF_AUTH_MODE;
    else process.env.STAFF_AUTH_MODE = previous;
  }
});
test("unencrypted preview transport is limited to the dedicated local inbox", () => {
  const keys = [
    "SMTP_MODE",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
  ];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      SMTP_MODE: "preview",
      SMTP_HOST: "mailpit",
      SMTP_PORT: "1025",
    });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    assert.equal(emailPreviewEnabled(), true);
    const transport = createMailTransport();
    assert.equal(transport.options.requireTLS, false);
    transport.close();
    process.env.SMTP_HOST = "external.example.org";
    assert.throws(() => emailPreviewEnabled());
    process.env.SMTP_MODE = "smtp";
    const secure = createMailTransport();
    assert.equal(secure.options.requireTLS, true);
    secure.close();
  } finally {
    for (const key of keys)
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
  }
});

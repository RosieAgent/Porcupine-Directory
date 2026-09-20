import { Router } from "express";
import { z } from "zod";
import { verify } from "@node-rs/argon2";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { pool } from "../db.js";
import {
  signupSchema,
  loginSchema,
  recoverySchema,
  activationSchema,
} from "../../shared/auth.js";
import {
  HttpError,
  appOrigin,
  rpID,
  generateToken,
  submissionPolicy,
  beginSession,
  requireUser,
  assertRecent,
  transaction,
  audit,
  limit,
  fingerprint,
  clearSessionCookie,
  requireCurrentSession,
} from "../security.js";

export const auth = Router();
import { hashSecret, replaceLostCredentials } from "../credentials.js";
import {
  createEmailRoutes,
  emailRecoveryEnabled,
  emailPreviewEnabled,
} from "./email.js";
import { passkeysEnabled, staffAuthMode } from "../features.js";
import { setupTokenHash } from "../setup-account.js";
const dummyHash = hashSecret("not-a-real-account-" + crypto.randomUUID());
const normalizePhrase = (phrase: string) =>
  phrase.trim().toLowerCase().split(/\s+/).join(" ");
auth.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
auth.get("/session", (req, res) =>
  res.json({
    user: req.account ?? null,
    emailRecoveryEnabled: emailRecoveryEnabled(),
    passkeysEnabled: passkeysEnabled(),
    staffAuthMode: staffAuthMode(),
    emailPreviewEnabled: emailPreviewEnabled(),
    submissionPolicy: submissionPolicy(),
  }),
);
auth.use("/email", createEmailRoutes());
auth.use("/passkeys", (_req, _res, next) => {
  if (!passkeysEnabled())
    throw new HttpError(404, "This authentication method is not enabled.");
  next();
});
auth.get("/csrf", limit("csrf", 500, 15), (req, res) =>
  res.json({ token: generateToken(req) }),
);
auth.post("/signup", limit("signup", 10, 60), async (req, res) => {
  const data = signupSchema.parse(req.body);
  const phrase = generateMnemonic(wordlist, data.words === 24 ? 256 : 128);
  const [passwordHash, recoveryHash] = await Promise.all([
    hashSecret(data.password),
    hashSecret(phrase),
  ]);
  const account = await transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO accounts(username,alias,password_hash,recovery_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO NOTHING RETURNING id,session_version`,
      [data.username, data.alias || "Anonymous", passwordHash, recoveryHash],
    );
    if (!rows[0]) throw new HttpError(409, "That username is unavailable.");
    await audit(client, rows[0].id, rows[0].id, "account.created");
    return rows[0];
  });
  await beginSession(req, account.id, account.session_version);
  res.status(201).json({ phrase });
});
auth.post("/login", limit("login", 20, 15), async (req, res) => {
  const data = loginSchema.parse(req.body);
  const { rows } = await pool.query(
    "SELECT id,password_hash,session_version FROM accounts WHERE username=$1",
    [data.username],
  );
  const valid = await verify(
    rows[0]?.password_hash || (await dummyHash),
    data.password,
  );
  if (!rows[0] || !valid)
    throw new HttpError(401, "Username or password is incorrect.");
  await beginSession(req, rows[0].id, rows[0].session_version, false, true);
  res.json({ ok: true });
});
auth.post(
  "/reauthenticate",
  requireUser,
  limit("reauthenticate", 10, 15),
  async (req, res) => {
    const { password } = z
      .object({ password: z.string().min(1).max(128) })
      .parse(req.body);
    const account = await transaction(async (client) => {
      await requireCurrentSession(client, req);
      const { rows } = await client.query(
        "SELECT id,password_hash,session_version FROM accounts WHERE id=$1",
        [req.account!.id],
      );
      if (!rows[0] || !(await verify(rows[0].password_hash, password)))
        throw new HttpError(401, "Password is incorrect.");
      await audit(
        client,
        rows[0].id,
        rows[0].id,
        "account.password-reverified",
      );
      return rows[0];
    });
    await beginSession(req, account.id, account.session_version, false, true);
    res.json({ ok: true });
  },
);
auth.post("/activate", limit("activation", 10, 60), async (req, res) => {
  const data = activationSchema.parse(req.body);
  const phrase = generateMnemonic(wordlist, 128);
  const [passwordHash, recoveryHash] = await Promise.all([
    hashSecret(data.password),
    hashSecret(phrase),
  ]);
  const account = await transaction(async (client) => {
    const { rows } = await client.query(
      "DELETE FROM account_setup WHERE token_hash=$1 AND expires_at>now() RETURNING account_id,role",
      [setupTokenHash(data.token)],
    );
    if (!rows[0])
      throw new HttpError(
        400,
        "This setup invitation is invalid, expired, or already used.",
      );
    const updated = await client.query(
      `UPDATE accounts SET password_hash=$2,recovery_hash=$3,role=$4,recovery_saved=false,
       session_version=session_version+1 WHERE id=$1 RETURNING id,session_version`,
      [rows[0].account_id, passwordHash, recoveryHash, rows[0].role],
    );
    await client.query("DELETE FROM sessions WHERE sess->>'accountId'=$1", [
      rows[0].account_id,
    ]);
    await audit(
      client,
      rows[0].account_id,
      rows[0].account_id,
      "account.setup-completed",
    );
    return updated.rows[0];
  });
  await beginSession(req, account.id, account.session_version);
  res.json({ phrase });
});
auth.post("/logout", async (req, res) => {
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((e) => (e ? reject(e) : resolve())),
  );
  clearSessionCookie(res);
  res.json({ ok: true });
});
auth.post("/recovery/saved", requireUser, async (req, res) => {
  await pool.query("UPDATE accounts SET recovery_saved=true WHERE id=$1", [
    req.account!.id,
  ]);
  res.json({ ok: true });
});
auth.post("/recover", limit("recovery", 5, 60), async (req, res) => {
  const data = recoverySchema.parse(req.body);
  const phrase = generateMnemonic(wordlist, 128);
  const [passwordHash, recoveryHash] = await Promise.all([
    hashSecret(data.password),
    hashSecret(phrase),
  ]);
  const account = await transaction(async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM accounts WHERE username=$1 FOR UPDATE",
      [data.username],
    );
    if (
      !(await verify(
        rows[0]?.recovery_hash || (await dummyHash),
        normalizePhrase(data.phrase),
      )) ||
      !rows[0]
    )
      throw new HttpError(401, "Account recovery details are incorrect.");
    const user = rows[0];
    return replaceLostCredentials(client, user.id, passwordHash, recoveryHash);
  });
  await beginSession(req, account.id, account.version);
  res.json({ phrase });
});
auth.post(
  "/security/reset",
  requireUser,
  limit("security", 10, 15),
  async (req, res) => {
    assertRecent(req);
    const data = z
      .object({ password: z.string().min(15).max(128) })
      .parse(req.body);
    const phrase = generateMnemonic(wordlist, 128);
    const [passwordHash, recoveryHash] = await Promise.all([
      hashSecret(data.password),
      hashSecret(phrase),
    ]);
    const version = await transaction(async (client) => {
      await requireCurrentSession(client, req);
      const { rows } = await client.query(
        "UPDATE accounts SET password_hash=$2,recovery_hash=$3,recovery_saved=false,session_version=session_version+1 WHERE id=$1 RETURNING session_version",
        [req.account!.id, passwordHash, recoveryHash],
      );
      await client.query("DELETE FROM sessions WHERE sess->>'accountId'=$1", [
        req.account!.id,
      ]);
      await audit(
        client,
        req.account!.id,
        req.account!.id,
        "account.password-and-recovery-rotated",
      );
      return rows[0].session_version;
    });
    // A password change is not a fresh proof of knowledge of the old password.
    // Require reauthentication before any further privileged operations.
    await beginSession(req, req.account!.id, version);
    res.json({ phrase });
  },
);
auth.post("/sessions/revoke", requireUser, async (req, res) => {
  assertRecent(req);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    await client.query(
      "UPDATE accounts SET session_version=session_version+1 WHERE id=$1",
      [req.account!.id],
    );
    await client.query("DELETE FROM sessions WHERE sess->>'accountId'=$1", [
      req.account!.id,
    ]);
    await audit(
      client,
      req.account!.id,
      req.account!.id,
      "account.sessions-revoked",
    );
  });
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((e) => (e ? reject(e) : resolve())),
  );
  clearSessionCookie(res);
  res.json({ ok: true });
});
async function saveChallenge(
  sessionID: string,
  purpose: string,
  challenge: string,
  accountId?: string,
) {
  await pool.query(
    `INSERT INTO auth_challenges VALUES ($1,$2,$3,$4,now()+interval '5 minutes') ON CONFLICT(session_key,purpose) DO UPDATE SET challenge=$3,account_id=$4,expires_at=EXCLUDED.expires_at`,
    [fingerprint(sessionID), purpose, challenge, accountId ?? null],
  );
}
async function consumeChallenge(sessionID: string, purpose: string) {
  const { rows } = await pool.query(
    "DELETE FROM auth_challenges WHERE session_key=$1 AND purpose=$2 AND expires_at>now() RETURNING *",
    [fingerprint(sessionID), purpose],
  );
  if (!rows[0])
    throw new HttpError(400, "Passkey request expired. Please try again.");
  return rows[0];
}
auth.post(
  "/passkeys/register/options",
  requireUser,
  limit("passkey", 30, 15),
  async (req, res) => {
    assertRecent(req);
    const keys = await pool.query(
      "SELECT id FROM passkeys WHERE account_id=$1",
      [req.account!.id],
    );
    if (keys.rowCount! >= 10)
      throw new HttpError(400, "Passkey limit reached.");
    const options = await generateRegistrationOptions({
      rpName: "Porcupine Directory",
      rpID,
      userID: new TextEncoder().encode(req.account!.id),
      userName: req.account!.username,
      attestationType: "none",
      excludeCredentials: keys.rows,
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    await saveChallenge(
      req.sessionID,
      "register",
      options.challenge,
      req.account!.id,
    );
    res.json(options);
  },
);
auth.post(
  "/passkeys/register/verify",
  requireUser,
  limit("passkey", 30, 15),
  async (req, res) => {
    assertRecent(req);
    const challenge = await consumeChallenge(req.sessionID, "register");
    if (challenge.account_id !== req.account!.id)
      throw new HttpError(400, "Passkey account mismatch.");
    let result;
    try {
      result = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: challenge.challenge,
        expectedOrigin: appOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new HttpError(400, "Passkey registration could not be verified.");
    }
    if (!result.verified)
      throw new HttpError(400, "Passkey registration failed.");
    const credential = result.registrationInfo.credential;
    await transaction(async (client) => {
      await requireCurrentSession(client, req);
      await client.query(
        "INSERT INTO passkeys(id,account_id,public_key,counter,transports) VALUES ($1,$2,$3,$4,$5)",
        [
          credential.id,
          req.account!.id,
          Buffer.from(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports || []),
        ],
      );
      await audit(
        client,
        req.account!.id,
        req.account!.id,
        "passkey.registered",
      );
    });
    // Enrollment alone does not elevate this session; prove possession in a fresh authentication.
    res.json({ ok: true });
  },
);
auth.post(
  "/passkeys/login/options",
  limit("passkey", 30, 15),
  async (req, res) => {
    const credentials = req.account
      ? (
          await pool.query(
            "SELECT id,transports FROM passkeys WHERE account_id=$1",
            [req.account.id],
          )
        ).rows
      : undefined;
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: credentials,
    });
    await saveChallenge(
      req.sessionID,
      "login",
      options.challenge,
      req.account?.id,
    );
    res.json(options);
  },
);
auth.post(
  "/passkeys/login/verify",
  limit("passkey", 30, 15),
  async (req, res) => {
    const challenge = await consumeChallenge(req.sessionID, "login");
    const id = z.string().max(2048).parse(req.body?.id);
    const account = await transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT p.*,a.session_version FROM passkeys p JOIN accounts a ON a.id=p.account_id WHERE p.id=$1 FOR UPDATE OF p,a",
        [id],
      );
      const key = rows[0];
      if (
        !key ||
        (challenge.account_id && key.account_id !== challenge.account_id)
      )
        throw new HttpError(401, "Passkey sign-in failed.");
      let result;
      try {
        result = await verifyAuthenticationResponse({
          response: req.body,
          expectedChallenge: challenge.challenge,
          expectedOrigin: appOrigin,
          expectedRPID: rpID,
          credential: {
            id: key.id,
            publicKey: key.public_key,
            counter: Number(key.counter),
            transports: key.transports,
          },
          requireUserVerification: true,
        });
      } catch {
        throw new HttpError(401, "Passkey sign-in failed.");
      }
      if (!result.verified) throw new HttpError(401, "Passkey sign-in failed.");
      await client.query("UPDATE passkeys SET counter=$2 WHERE id=$1", [
        id,
        result.authenticationInfo.newCounter,
      ]);
      return key;
    });
    await beginSession(req, account.account_id, account.session_version, true);
    res.json({ ok: true });
  },
);

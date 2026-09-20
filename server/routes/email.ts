import { Router } from "express";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { pool } from "../db.js";
import {
  HttpError,
  requireUser,
  assertRecent,
  transaction,
  audit,
  limit,
  beginSession,
  appOrigin,
  requireCurrentSession,
} from "../security.js";
import { hashSecret, replaceLostCredentials } from "../credentials.js";
import { usernameSchema, passwordSchema } from "../../shared/auth.js";
export const emailRecoveryEnabled = () =>
  !!process.env.SMTP_HOST &&
  !!process.env.SMTP_FROM &&
  /^[a-f0-9]{64}$/i.test(process.env.EMAIL_ENCRYPTION_KEY ?? "");
export function emailPreviewEnabled() {
  if (process.env.SMTP_MODE !== "preview") return false;
  const origin = new URL(appOrigin);
  if (
    !["localhost", "127.0.0.1"].includes(origin.hostname) ||
    process.env.SMTP_HOST !== "mailpit" ||
    process.env.SMTP_PORT !== "1025" ||
    process.env.SMTP_USER ||
    process.env.SMTP_PASSWORD
  )
    throw new Error(
      "Local mail preview requires a loopback app origin and the private mailpit:1025 service without credentials.",
    );
  return true;
}
function key() {
  return Buffer.from(process.env.EMAIL_ENCRYPTION_KEY!, "hex");
}
export function encryptEmail(address: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  return Buffer.concat([
    iv,
    cipher.update(address, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
}
export function decryptEmail(value: string) {
  const bytes = Buffer.from(value, "base64url"),
    decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    decipher.update(bytes.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8");
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Delivery = (to: string, subject: string, text: string) => Promise<void>;
export function createMailTransport() {
  const preview = emailPreviewEnabled();
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: !preview,
    ignoreTLS: preview,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
const deliver: Delivery = async (to, subject, text) => {
  const transport = createMailTransport();
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  } finally {
    transport.close();
  }
};
export function createEmailRoutes(send: Delivery = deliver) {
  const router = Router();
  router.use((_req, _res, next) => {
    if (!emailRecoveryEnabled())
      throw new HttpError(
        503,
        "Email recovery is not configured on this installation.",
      );
    next();
  });
  router.get("/status", requireUser, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT address_encrypted IS NOT NULL AS verified,pending_encrypted IS NOT NULL AS pending FROM recovery_emails WHERE account_id=$1",
      [req.account!.id],
    );
    res.json(rows[0] ?? { verified: false, pending: false });
  });
  router.post(
    "/setup",
    requireUser,
    limit("email-setup", 5, 60),
    async (req, res) => {
      assertRecent(req);
      const { email } = z.object({ email: z.email().max(254) }).parse(req.body);
      const token = randomBytes(32).toString("base64url");
      await transaction(async (client) => {
        await requireCurrentSession(client, req);
        await client.query(
          `INSERT INTO recovery_emails(account_id,pending_encrypted,verification_hash,verification_expires) VALUES ($1,$2,$3,now()+interval '15 minutes') ON CONFLICT(account_id) DO UPDATE SET pending_encrypted=$2,verification_hash=$3,verification_expires=EXCLUDED.verification_expires`,
          [req.account!.id, encryptEmail(email), digest(token)],
        );
      });
      try {
        await send(
          email,
          "Confirm Porcupine Directory recovery email",
          `You requested email recovery for your Porcupine Directory account. Enter this verification code on ${appOrigin}/account/security within 15 minutes:\n\n${token}\n\nIf you did not request this, ignore this message. No recovery email is activated until verified.`,
        );
      } catch {
        // A failed send must not leave an unusable pending verification. Never
        // clear a newer concurrent request or the previously verified address.
        await pool.query(
          "UPDATE recovery_emails SET pending_encrypted=NULL,verification_hash=NULL,verification_expires=NULL WHERE account_id=$1 AND verification_hash=$2",
          [req.account!.id, digest(token)],
        );
        throw new HttpError(
          503,
          "The verification email could not be delivered. Please try again.",
        );
      }
      res.json({ ok: true });
    },
  );
  router.post(
    "/verify",
    requireUser,
    limit("email-verify", 10, 60),
    async (req, res) => {
      assertRecent(req);
      const { code } = z
        .object({ code: z.string().trim().min(20).max(100) })
        .parse(req.body);
      await transaction(async (client) => {
        await requireCurrentSession(client, req);
        const result = await client.query(
          `UPDATE recovery_emails SET address_encrypted=pending_encrypted,pending_encrypted=NULL,verification_hash=NULL,verification_expires=NULL,reset_hash=NULL,reset_expires=NULL WHERE account_id=$1 AND verification_hash=$2 AND verification_expires>now() RETURNING account_id`,
          [req.account!.id, digest(code)],
        );
        if (!result.rowCount)
          throw new HttpError(
            400,
            "The verification code is invalid or expired.",
          );
        await audit(
          client,
          req.account!.id,
          req.account!.id,
          "recovery-email.verified",
        );
      });
      res.json({ ok: true });
    },
  );
  router.delete("/", requireUser, async (req, res) => {
    assertRecent(req);
    await transaction(async (client) => {
      await requireCurrentSession(client, req);
      await client.query("DELETE FROM recovery_emails WHERE account_id=$1", [
        req.account!.id,
      ]);
      await audit(
        client,
        req.account!.id,
        req.account!.id,
        "recovery-email.removed",
      );
    });
    res.json({ ok: true });
  });
  router.post("/request", limit("recovery", 5, 60), async (req, res) => {
    const username = usernameSchema.parse(req.body?.username);
    const token = randomBytes(32).toString("base64url");
    const { rows } = await pool.query(
      `UPDATE recovery_emails e SET reset_hash=$2,reset_expires=now()+interval '15 minutes' FROM accounts a WHERE a.id=e.account_id AND a.username=$1 AND e.address_encrypted IS NOT NULL RETURNING e.address_encrypted`,
      [username, digest(token)],
    );
    if (rows[0]) {
      // Same public response regardless of account existence or delivery status. No token in URLs/logs.
      void Promise.resolve()
        .then(() =>
          send(
            decryptEmail(rows[0].address_encrypted),
            "Porcupine Directory account recovery",
            `A recovery request was made for your account. Enter this code on ${appOrigin}/recover within 15 minutes:\n\n${token}\n\nIf this was not you, ignore this message. Your account has not changed.`,
          ),
        )
        .catch(() => console.error("Recovery email delivery failed"));
    }
    res.json({ ok: true });
  });
  router.post("/recover", limit("recovery", 5, 60), async (req, res) => {
    const data = z
      .object({
        username: usernameSchema,
        code: z.string().trim().max(100),
        password: passwordSchema,
      })
      .parse(req.body);
    const phrase = generateMnemonic(wordlist, 128);
    const [passwordHash, recoveryHash] = await Promise.all([
      hashSecret(data.password),
      hashSecret(phrase),
    ]);
    const account = await transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT id FROM accounts WHERE username=$1 FOR UPDATE",
        [data.username],
      );
      if (!rows[0])
        throw new HttpError(401, "Account recovery details are incorrect.");
      const verified = await client.query(
        "SELECT account_id FROM recovery_emails WHERE account_id=$1 AND reset_hash=$2 AND reset_expires>now() FOR UPDATE",
        [rows[0].id, digest(data.code)],
      );
      if (!verified.rowCount)
        throw new HttpError(401, "Account recovery details are incorrect.");
      return replaceLostCredentials(
        client,
        rows[0].id,
        passwordHash,
        recoveryHash,
      );
    });
    await beginSession(req, account.id, account.version);
    res.json({ phrase });
  });
  return router;
}

import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { csrfSync } from "csrf-sync";
import { createHmac, randomBytes } from "node:crypto";
import type { Request, RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import type { Account } from "../shared/auth.js";
import { passkeysEnabled, staffAuthMode } from "./features.js";

declare module "express-session" {
  interface SessionData {
    accountId?: string;
    version?: number;
    authenticatedAt?: number;
    strongAt?: number;
    passwordAuthenticatedAt?: number;
  }
}
declare global {
  // Express publishes Request as a global namespace for application augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      account?: Account;
    }
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const appOrigin = new URL(
  process.env.APP_ORIGIN || "http://localhost:4350",
).origin;
const originUrl = new URL(appOrigin);
export const rpID = originUrl.hostname;
const local = ["localhost", "127.0.0.1"].includes(rpID);
if (!local && originUrl.protocol !== "https:")
  throw new Error("Public deployments require HTTPS APP_ORIGIN.");
if (!local && (process.env.SESSION_SECRET?.length ?? 0) < 32)
  throw new Error("Set a persistent SESSION_SECRET of at least 32 characters.");
const secret =
  process.env.SESSION_SECRET || randomBytes(48).toString("base64url");
export const fingerprint = (value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");
const secure = originUrl.protocol === "https:";
const cookieName = secure ? "__Host-porcupine" : "porcupine.sid";
const PgStore = connectPgSimple(session);
export const sessionStore = new PgStore({
  pool,
  schemaName: process.env.DATABASE_SCHEMA || "public",
  tableName: "sessions",
  pruneSessionInterval: 600,
});
export const sessions = session({
  name: cookieName,
  secret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400000,
  },
});
export const { generateToken, csrfSynchronisedProtection } = csrfSync({
  getTokenFromRequest: (req) => req.get("x-csrf-token"),
});
export const submissionPolicy = () =>
  process.env.SUBMISSION_POLICY === "pending_review"
    ? ("pending_review" as const)
    : ("published" as const);
if (
  process.env.SUBMISSION_POLICY &&
  !["published", "pending_review"].includes(process.env.SUBMISSION_POLICY)
)
  throw new Error(
    "Invalid SUBMISSION_POLICY; use published or pending_review.",
  );
export const loadAccount: RequestHandler = async (req, _res, next) => {
  if (req.session.accountId) {
    const { rows } = await pool.query(
      `SELECT id,username,alias,role,privileges_suspended AS "privilegesSuspended",recovery_saved AS "recoverySaved",session_version,
      (SELECT count(*)::int FROM passkeys WHERE account_id=accounts.id) AS "passkeyCount" FROM accounts WHERE id=$1`,
      [req.session.accountId],
    );
    const row = rows[0];
    if (row && row.session_version === req.session.version) {
      req.account = {
        id: row.id,
        username: row.username,
        alias: row.alias,
        role: row.role,
        privilegesSuspended: row.privilegesSuspended,
        recoverySaved: row.recoverySaved,
        passkeyCount: row.passkeyCount,
        strong: recentlyVerified(req.session.strongAt),
        staffVerified:
          staffAuthMode() === "session" ||
          recentlyVerified(
            staffAuthMode() === "password_recent"
              ? req.session.passwordAuthenticatedAt
              : req.session.strongAt,
          ),
      };
    } else {
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((e) => (e ? reject(e) : resolve())),
      );
    }
  }
  next();
};
export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.account) throw new HttpError(401, "Sign in to continue.");
  next();
};
export function isEditor(req: Request) {
  return (
    !!req.account &&
    req.account.role !== "user" &&
    !req.account.privilegesSuspended
  );
}
export function recentlyVerified(
  at: number | undefined,
  minutes = 15,
  now = Date.now(),
) {
  return (
    typeof at === "number" &&
    Number.isFinite(at) &&
    at <= now &&
    now - at < minutes * 60000
  );
}
export function assertStaff(req: Request, administrator = false) {
  if (
    !isEditor(req) ||
    (administrator && req.account?.role !== "administrator")
  )
    throw new HttpError(403, "This action requires an authorized editor.");
  if (!req.account?.recoverySaved)
    throw new HttpError(
      403,
      "Save your recovery phrase before using staff actions.",
    );
  if (
    staffAuthMode() !== "session" &&
    !recentlyVerified(
      staffAuthMode() === "password_recent"
        ? req.session.passwordAuthenticatedAt
        : req.session.strongAt,
    )
  )
    throw new HttpError(
      403,
      staffAuthMode() === "password_recent"
        ? "Verify your password again to continue (valid for 15 minutes)."
        : passkeysEnabled()
          ? "Verify with your passkey to continue (valid for 15 minutes)."
          : "Additional staff verification is required. Staff access is unavailable until the administrator configures the authentication policy.",
    );
}
export const requireStaff: RequestHandler = (req, _res, next) => {
  assertStaff(req);
  next();
};
export const requireAdmin: RequestHandler = (req, _res, next) => {
  assertStaff(req, true);
  next();
};
export function assertRecent(req: Request) {
  if (!req.account || !recentlyVerified(req.session.authenticatedAt, 5))
    throw new HttpError(403, "Sign in again before changing account security.");
  if (
    req.account.role !== "user" &&
    staffAuthMode() !== "passkey" &&
    !recentlyVerified(req.session.passwordAuthenticatedAt, 5)
  )
    throw new HttpError(
      403,
      "Verify your password again before changing account security.",
    );
  if (
    staffAuthMode() === "passkey" &&
    req.account.role !== "user" &&
    !req.account.strong &&
    req.account.passkeyCount > 0
  )
    throw new HttpError(
      403,
      passkeysEnabled()
        ? "Verify your existing passkey first."
        : "Additional staff verification is required before changing account security.",
    );
}
export async function beginSession(
  req: Request,
  id: string,
  version: number,
  strong = false,
  passwordVerified = false,
) {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.accountId = id;
  req.session.version = version;
  req.session.authenticatedAt = Date.now();
  if (strong) req.session.strongAt = Date.now();
  if (passwordVerified) req.session.passwordAuthenticatedAt = Date.now();
  await new Promise<void>((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function audit(
  client: PoolClient,
  actor: string | null,
  subject: string,
  action: string,
) {
  await client.query(
    "INSERT INTO security_audit(actor_id,subject_id,action) VALUES ($1,$2,$3)",
    [actor, subject, action],
  );
}
export async function requireCurrentSession(client: PoolClient, req: Request) {
  const { rows } = await client.query(
    "SELECT session_version FROM accounts WHERE id=$1 FOR UPDATE",
    [req.account?.id],
  );
  if (!req.account || rows[0]?.session_version !== req.session.version)
    throw new HttpError(401, "Please sign in again.");
}
// Short-lived keyed pseudonyms, not raw IP addresses. Fixed-window limits survive restarts/replicas.
export function limit(
  bucket: string,
  maximum: number,
  minutes: number,
): RequestHandler {
  return async (req, _res, next) => {
    const keys = [bucket + ":ip:" + fingerprint(req.ip || "unknown")];
    if (bucket === "login" || bucket === "recovery")
      keys.push(
        bucket +
          ":user:" +
          fingerprint(
            String(req.body?.username || "")
              .trim()
              .normalize("NFKC")
              .toLowerCase(),
          ),
      );
    if (bucket === "reauthenticate")
      keys.push(
        bucket + ":account:" + fingerprint(req.account?.id ?? "unknown"),
      );
    for (const key of keys) {
      const { rows } = await pool.query(
        `INSERT INTO rate_buckets VALUES ($1,1,now()+($2*interval '1 minute'))
        ON CONFLICT (key) DO UPDATE SET hits=CASE WHEN rate_buckets.expires_at<now() THEN 1 ELSE rate_buckets.hits+1 END,
        expires_at=CASE WHEN rate_buckets.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_buckets.expires_at END RETURNING hits`,
        [key, minutes],
      );
      if (rows[0].hits > maximum)
        throw new HttpError(429, "Too many attempts. Please try again later.");
    }
    await pool.query("DELETE FROM rate_buckets WHERE expires_at<now()");
    await pool.query("DELETE FROM auth_challenges WHERE expires_at<now()");
    await pool.query(
      "UPDATE recovery_emails SET pending_encrypted=NULL,verification_hash=NULL,verification_expires=NULL WHERE verification_expires<now()",
    );
    await pool.query(
      "UPDATE recovery_emails SET reset_hash=NULL,reset_expires=NULL WHERE reset_expires<now()",
    );
    next();
  };
}
export const checkOrigin: RequestHandler = (req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const allowed = [
      appOrigin,
      ...(local
        ? [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:4350",
          ]
        : []),
    ];
    if (
      req.get("sec-fetch-site") === "cross-site" ||
      (req.get("origin") && !allowed.includes(req.get("origin")!))
    )
      throw new HttpError(403, "Cross-site request rejected.");
  }
  next();
};
export const clearSessionCookie = (res: import("express").Response) =>
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });

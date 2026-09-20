import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { HttpError, fingerprint } from "./security.js";

export const serviceEnvironments = [
  "development",
  "staging",
  "production",
] as const;
export type ServiceEnvironment = (typeof serviceEnvironments)[number];
export const serviceScopes = ["listings:read", "listings:write"] as const;
export type ServiceScope = (typeof serviceScopes)[number];

export function runtimeEnvironment(): ServiceEnvironment {
  const configured = process.env.APP_ENVIRONMENT;
  if (
    configured &&
    serviceEnvironments.includes(configured as ServiceEnvironment)
  )
    return configured as ServiceEnvironment;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function hashServiceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createServiceTokenValue() {
  return "pd_pat_" + randomBytes(32).toString("base64url");
}

export function validServiceName(value: string) {
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(name))
    throw new HttpError(
      400,
      "Use a simple service name of 3–80 lowercase characters.",
    );
  return name;
}

export function serviceTokenExpiry(days = 90) {
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new HttpError(400, "Token lifetime must be between 1 and 365 days.");
  return new Date(Date.now() + days * 86400000);
}

export async function insertServiceAccount(
  client: PoolClient,
  input: {
    name: string;
    environment: ServiceEnvironment;
    expiresInDays?: number;
  },
) {
  const name = validServiceName(input.name);
  const token = createServiceTokenValue();
  const expiresAt = serviceTokenExpiry(input.expiresInDays);
  const result = await client.query(
    `INSERT INTO service_accounts(name,environment,scopes,token_hash,token_prefix,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id,name,environment,scopes,token_prefix AS "tokenPrefix",expires_at AS "expiresAt",revoked_at AS "revokedAt",created_at AS "createdAt",last_used_at AS "lastUsedAt"`,
    [
      name,
      input.environment,
      serviceScopes,
      hashServiceToken(token),
      token.slice(0, 16),
      expiresAt,
    ],
  );
  return { serviceAccount: result.rows[0], token };
}

export const authenticateServiceToken: RequestHandler = async (
  req,
  res,
  next,
) => {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match) throw new HttpError(401, "A service token is required.");
  const token = match[1];
  if (!token.startsWith("pd_pat_"))
    throw new HttpError(401, "The service token is invalid.");

  const { rows } = await pool.query(
    `SELECT id,name,environment,scopes
     FROM service_accounts
     WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() AND environment=$2`,
    [hashServiceToken(token), runtimeEnvironment()],
  );
  const service = rows[0];
  if (!service)
    throw new HttpError(401, "The service token is invalid or expired.");

  req.serviceAccount = {
    id: service.id,
    name: service.name,
    environment: service.environment,
    scopes: service.scopes,
  };
  req.requestId = randomUUID();
  res.set("X-Request-ID", req.requestId);
  await pool.query(
    "UPDATE service_accounts SET last_used_at=now(),last_used_ip=$2 WHERE id=$1",
    [service.id, fingerprint(req.ip || "unknown")],
  );
  next();
};

export function requireServiceScope(scope: ServiceScope): RequestHandler {
  return (req, _res, next) => {
    if (!req.serviceAccount?.scopes.includes(scope))
      throw new HttpError(403, `The service token lacks the ${scope} scope.`);
    next();
  };
}

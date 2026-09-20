import { createHash, randomBytes } from "node:crypto";
import { usernameSchema } from "../shared/auth.js";
import { hashSecret } from "./credentials.js";
import { transaction, audit, HttpError } from "./security.js";

export const setupTokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function renewAccountInvitation(username: string) {
  const token = randomBytes(32).toString("base64url");
  await transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE account_setup s SET token_hash=$2,expires_at=now()+interval '24 hours'
      FROM accounts a WHERE s.account_id=a.id AND a.username=$1 RETURNING s.account_id`,
      [usernameSchema.parse(username), setupTokenHash(token)],
    );
    if (!rows[0])
      throw new HttpError(
        409,
        "No pending invitation for that username. Activated accounts cannot be reset here.",
      );
    await audit(
      client,
      null,
      rows[0].account_id,
      "host.setup-invitation-renewed",
    );
  });
  return token;
}
export async function inviteAccount(
  username: string,
  role: "user" | "editor" | "administrator",
) {
  const normalized = usernameSchema.parse(username);
  const token = randomBytes(32).toString("base64url");
  const [password, recovery] = await Promise.all([
    hashSecret(randomBytes(48).toString("base64url")),
    hashSecret(randomBytes(48).toString("base64url")),
  ]);
  await transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO accounts(username,alias,password_hash,recovery_hash) VALUES ($1,'Anonymous',$2,$3)
       ON CONFLICT(username) DO NOTHING RETURNING id`,
      [normalized, password, recovery],
    );
    if (!rows[0])
      throw new HttpError(
        409,
        "That username already exists; no account was changed.",
      );
    await client.query(
      "INSERT INTO account_setup VALUES ($1,$2,$3,now()+interval '24 hours')",
      [rows[0].id, setupTokenHash(token), role],
    );
    await audit(client, null, rows[0].id, "host.setup-invited." + role);
  });
  return token;
}

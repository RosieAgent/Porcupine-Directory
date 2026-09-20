import { hash, Algorithm } from "@node-rs/argon2";
import type { PoolClient } from "pg";
import { audit } from "./security.js";
export const hashSecret = (value: string) =>
  hash(value, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export async function replaceLostCredentials(
  client: PoolClient,
  id: string,
  passwordHash: string,
  recoveryHash: string,
) {
  const { rows } = await client.query(
    `UPDATE accounts SET password_hash=$2,recovery_hash=$3,recovery_saved=false,session_version=session_version+1,privileges_suspended=(role<>'user') WHERE id=$1 RETURNING session_version`,
    [id, passwordHash, recoveryHash],
  );
  await client.query("DELETE FROM passkeys WHERE account_id=$1", [id]);
  await client.query("DELETE FROM sessions WHERE sess->>'accountId'=$1", [id]);
  await client.query(
    "UPDATE recovery_emails SET reset_hash=NULL,reset_expires=NULL,verification_hash=NULL,verification_expires=NULL,pending_encrypted=NULL WHERE account_id=$1",
    [id],
  );
  await audit(
    client,
    id,
    id,
    "account.recovered.credentials-revoked.staff-suspended",
  );
  return { id, version: rows[0].session_version };
}

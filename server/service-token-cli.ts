import { pool } from "./db.js";
import { audit, transaction } from "./security.js";
import {
  createServiceTokenValue,
  hashServiceToken,
  insertServiceAccount,
  serviceEnvironments,
  serviceTokenExpiry,
  type ServiceEnvironment,
  validServiceName,
} from "./service-accounts.js";

const [command, name, environment, ttlArgument] = process.argv.slice(2);
const usage =
  "Usage: service-token-cli create|rotate|revoke NAME development|staging|production [days]";

function validEnvironment(value: string): ServiceEnvironment {
  if (!serviceEnvironments.includes(value as ServiceEnvironment))
    throw new Error("Environment must be development, staging or production.");
  return value as ServiceEnvironment;
}

try {
  if (!command || !name || !environment) throw new Error(usage);
  const serviceName = validServiceName(name);
  const serviceEnvironment = validEnvironment(environment);
  if (!["create", "rotate", "revoke"].includes(command)) throw new Error(usage);
  if (command === "revoke") {
    await transaction(async (client) => {
      const result = await client.query(
        "UPDATE service_accounts SET revoked_at=COALESCE(revoked_at,now()) WHERE name=$1 AND environment=$2 RETURNING id",
        [serviceName, serviceEnvironment],
      );
      if (!result.rowCount) throw new Error("Service account not found.");
      await audit(client, null, result.rows[0].id, "service-account.revoked", {
        actorType: "system",
        subjectType: "service_account",
        details: { name: serviceName, environment: serviceEnvironment },
      });
    });
    console.log(`Revoked ${serviceName} (${serviceEnvironment}).`);
  } else {
    const expiresInDays = ttlArgument === undefined ? 90 : Number(ttlArgument);
    let output:
      { token: string; expiresAt: Date; scopes: readonly string[] } | undefined;
    await transaction(async (client) => {
      if (command === "create") {
        const { serviceAccount, token } = await insertServiceAccount(client, {
          name: serviceName,
          environment: serviceEnvironment,
          expiresInDays,
        });
        await audit(
          client,
          null,
          serviceAccount.id,
          "service-account.created",
          {
            actorType: "system",
            subjectType: "service_account",
            details: {
              name: serviceName,
              environment: serviceEnvironment,
              scopes: serviceAccount.scopes,
              expiresAt: serviceAccount.expiresAt,
            },
          },
        );
        output = {
          token,
          expiresAt: serviceAccount.expiresAt,
          scopes: serviceAccount.scopes,
        };
      } else {
        const token = createServiceTokenValue();
        const expiresAt = serviceTokenExpiry(expiresInDays);
        const result = await client.query(
          `UPDATE service_accounts
           SET scopes=$3,token_hash=$4,token_prefix=$5,expires_at=$6,revoked_at=NULL
           WHERE name=$1 AND environment=$2 RETURNING id`,
          [
            serviceName,
            serviceEnvironment,
            ["listings:read", "listings:write"],
            hashServiceToken(token),
            token.slice(0, 16),
            expiresAt,
          ],
        );
        if (!result.rowCount) throw new Error("Service account not found.");
        await audit(
          client,
          null,
          result.rows[0].id,
          "service-account.rotated",
          {
            actorType: "system",
            subjectType: "service_account",
            details: {
              name: serviceName,
              environment: serviceEnvironment,
              scopes: ["listings:read", "listings:write"],
              expiresAt: expiresAt.toISOString(),
            },
          },
        );
        output = {
          token,
          expiresAt,
          scopes: ["listings:read", "listings:write"],
        };
      }
    });
    if (output) {
      console.log(`Service token for ${serviceName} (${serviceEnvironment})`);
      console.log(`Expires: ${output.expiresAt.toISOString()}`);
      console.log(`Scopes: ${output.scopes.join(", ")}`);
      console.log("Store this token now; it will not be shown again:");
      console.log(output.token);
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Service token operation failed.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}

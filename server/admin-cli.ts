import { pool } from "./db.js";
import { migrate } from "./migrate.js";
import { transaction, audit } from "./security.js";
import { usernameSchema } from "../shared/auth.js";
import { staffAuthMode } from "./features.js";
// Host access is the trust boundary. Never promote the first public signup automatically.
try {
  const username = usernameSchema.parse(process.argv[2]);
  await migrate();
  await transaction(async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM accounts WHERE username=$1 FOR UPDATE",
      [username],
    );
    if (!rows[0])
      throw new Error("Create this account through the website first.");
    const user = rows[0];
    const keys = await client.query(
      "SELECT 1 FROM passkeys WHERE account_id=$1",
      [user.id],
    );
    if (
      (staffAuthMode() === "passkey" && !keys.rowCount) ||
      !user.recovery_saved
    )
      throw new Error(
        staffAuthMode() === "passkey"
          ? "Save the recovery phrase and register a passkey before promotion."
          : "Save the recovery phrase before promotion.",
      );
    await client.query(
      "UPDATE accounts SET role='administrator',privileges_suspended=false,session_version=session_version+1 WHERE id=$1",
      [user.id],
    );
    await client.query("DELETE FROM sessions WHERE sess->>'accountId'=$1", [
      user.id,
    ]);
    await audit(
      client,
      null,
      user.id,
      "host.administrator-granted-or-restored",
    );
  });
  console.log(
    staffAuthMode() === "passkey"
      ? "Administrator access granted. Sign in with your passkey."
      : "Administrator access granted. Sign in with your password.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Promotion failed.");
  process.exitCode = 1;
} finally {
  await pool.end();
}

import { z } from "zod";
import { pool } from "./db.js";
import { inviteAccount, renewAccountInvitation } from "./setup-account.js";
import { appOrigin } from "./security.js";
try {
  const role =
    process.argv[3] === "--renew"
      ? null
      : z.enum(["user", "editor", "administrator"]).parse(process.argv[3]);
  const token = role
    ? await inviteAccount(process.argv[2] ?? "", role)
    : await renewAccountInvitation(process.argv[2] ?? "");
  console.log(`${appOrigin}/activate#token=${token}`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Account setup failed.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}

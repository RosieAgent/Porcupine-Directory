import { closeDb, pool } from "./db.js";
import { migrate } from "./migrate.js";

async function ensureRuntimeRole() {
  const password = process.env.APP_DB_PASSWORD;
  if (!password) return;
  const role = await pool.query(
    "SELECT EXISTS (SELECT FROM pg_roles WHERE rolname='porcupine_app') AS exists",
  );
  const quoted = await pool.query("SELECT quote_literal($1) AS value", [
    password,
  ]);
  const command = role.rows[0].exists ? "ALTER ROLE" : "CREATE ROLE";
  await pool.query(
    `${command} porcupine_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${quoted.rows[0].value}`,
  );
}

try {
  await ensureRuntimeRole();
  await migrate();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
} finally {
  await closeDb();
}

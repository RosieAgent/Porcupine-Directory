import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("Set DATABASE_URL before starting the application.");

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
});

export async function closeDb() {
  await pool.end();
}

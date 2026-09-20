import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://porcupine:porcupine@localhost:5438/porcupine_directory",
  connectionTimeoutMillis: 5000,
});

export async function closeDb() {
  await pool.end();
}

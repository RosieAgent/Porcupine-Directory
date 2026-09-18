import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://porcupine:porcupine@localhost:5432/porcupine_directory"
});

export async function closeDb() {
  await pool.end();
}

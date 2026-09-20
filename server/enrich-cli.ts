// Host-only invocation. No HTTP enrichment endpoint or background crawler.
import { readFile } from "node:fs/promises";
import { pool } from "./db.js";
import { applyEnrichment } from "./enrichment.js";
try {
  const data: unknown = JSON.parse(
    await readFile(process.argv[2] ?? "", "utf8"),
  );
  (await applyEnrichment(data)).forEach((message) => console.log(message));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Enrichment failed.");
  process.exitCode = 1;
} finally {
  await pool.end();
}

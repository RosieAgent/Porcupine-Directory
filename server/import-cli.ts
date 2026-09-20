import { readFile } from "node:fs/promises";
import { importDirectory } from "./directory-import.js";
import { closeDb } from "./db.js";

try {
  const html = process.argv[2]
    ? await readFile(process.argv[2], "utf8")
    : undefined;
  console.log(`Imported ${await importDirectory(html)} source entries.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}

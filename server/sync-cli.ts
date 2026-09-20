import { adapters, syncEventSource } from "./event-sync.js";
import { migrate } from "./migrate.js";
import { closeDb } from "./db.js";
try {
  await migrate();
  const result = await syncEventSource(adapters[0], true);
  console.log(JSON.stringify({ ...result, windowDays: 90 }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}

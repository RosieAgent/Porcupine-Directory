import { readFile } from "node:fs/promises";
import { pool } from "./db.js";
import { legacyConnections } from "../shared/connections.js";
import { tagIconKey } from "../shared/tag-icons.js";

// Additive migrations run before serving requests; the lock also protects replicas.
export async function migrate() {
  const migrations = [
    "002_event_sync.sql",
    "003_accounts.sql",
    "004_account_setup.sql",
    "005_connections.sql",
    "006_connection_revisions.sql",
    "007_entry_context.sql",
    "008_joining_placeholders.sql",
    "009_publications.sql",
    "010_tags.sql",
    "011_ownership.sql",
    "012_event_locations.sql",
    "013_moderation.sql",
    "014_entry_kind.sql",
    "015_catalog_provenance.sql",
    "016_external_owner.sql",
    "017_runtime_role.sql",
    "018_service_accounts.sql",
    "019_reference_source_updates.sql",
    "020_saved_tags.sql",
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(4350002)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)`,
    );
    for (const name of migrations) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (applied.rowCount) continue;
      await client.query(await readFile("db/migrations/" + name, "utf8"));
      if (name === "010_tags.sql") {
        const { rows } = await client.query(
          "SELECT id,name FROM tag_definitions",
        );
        for (const tag of rows)
          await client.query("UPDATE tag_definitions SET icon=$2 WHERE id=$1", [
            tag.id,
            tag.name === "Nonprofit" ? "organization" : tagIconKey(tag.name),
          ]);
        await client.query(
          "INSERT INTO tag_revisions(tag_id,action,reason,after_data) SELECT id,'baseline','Existing tag inventory preserved during catalog migration',to_jsonb(t) FROM tag_definitions t",
        );
      }
      if (name === "005_connections.sql") {
        await client.query(
          "SELECT set_config('app.action','connections-migrated',true)",
        );
        const { rows } = await client.query(
          "SELECT id,url,contact_url,links FROM listings",
        );
        for (const row of rows) {
          const connections = legacyConnections(row);
          if (connections.length)
            await client.query(
              "UPDATE listings SET connections=$2 WHERE id=$1",
              [row.id, JSON.stringify(connections)],
            );
        }
        await client.query("SELECT set_config('app.action','',true)");
      }
      await client.query("INSERT INTO schema_migrations VALUES ($1)", [name]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

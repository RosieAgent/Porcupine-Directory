import type { PoolClient } from "pg";
import { HttpError } from "./security.js";
import {
  linkedPlatformTags,
  platformTagForConnection,
} from "../shared/platform-tags.js";

export async function syncPlatformTags(
  client: PoolClient,
  names: string[],
  connections: { url: string; type?: string }[],
) {
  await client.query("SELECT pg_advisory_xact_lock(4350010)");
  const { rows } = await client.query(
    "SELECT n.key,d.name,d.retired FROM tag_names n JOIN tag_definitions d ON d.id=n.tag_id WHERE n.key=ANY($1::text[])",
    [linkedPlatformTags.map((name) => name.toLowerCase())],
  );
  const supplied = new Set(
    connections
      .map((link) => platformTagForConnection(link)?.toLowerCase())
      .filter(Boolean),
  );
  const managed = new Set(rows.map((row) => row.name));
  const supported = rows
    .filter((row) => !row.retired && supplied.has(row.key))
    .map((row) => row.name as string);
  const result = [
    ...new Set([
      ...names.filter((name) => !managed.has(name) || supported.includes(name)),
      ...supported,
    ]),
  ];
  if (result.length > 12)
    throw new HttpError(
      400,
      "Choose fewer topic tags to leave room for the platform tags derived from your links (12 tags total).",
    );
  return result;
}

// Legacy arrays remain readable/restorable. Stable catalog IDs and name aliases
// make renames/merges compatible with existing links and historic revisions.
export async function canonicalTags(
  client: PoolClient,
  names: string[],
  previous: string[] = [],
  restoring = false,
) {
  await client.query("SELECT pg_advisory_xact_lock(4350010)");
  const keys = [...new Set(names.map((n) => n.trim().toLowerCase()))];
  const { rows } = await client.query(
    `SELECT n.key,d.name,d.retired,d.id FROM tag_names n JOIN tag_definitions d ON d.id=n.tag_id WHERE n.key=ANY($1::text[])`,
    [keys],
  );
  const previousRows = previous.length
    ? await client.query(
        "SELECT tag_id FROM tag_names WHERE key=ANY($1::text[])",
        [previous.map((n) => n.trim().toLowerCase())],
      )
    : { rows: [] };
  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    if (!row)
      throw new HttpError(
        400,
        "Select existing tags. Only editors can create new tags in the tag catalog.",
      );
    if (
      row.retired &&
      !restoring &&
      !previousRows.rows.some((r) => r.tag_id === row.id)
    )
      throw new HttpError(
        400,
        "A selected tag was retired. Select an active tag instead.",
      );
  }
  return [
    ...new Set(
      keys.map((key) => rows.find((r) => r.key === key)!.name as string),
    ),
  ];
}

// Explicit host workflow for a reviewed, local research file. Never fetches arbitrary URLs.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "./security.js";
import { submissionSchema, listingSchema } from "../shared/contracts.js";
import { connectionSchema, classifyConnection } from "../shared/connections.js";
import type { Connection } from "../shared/connections.js";
import { updateContent } from "./routes/listings.js";
import { canonicalTags } from "./tags.js";
const researchSchema = z.array(
  z.object({
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
    expectedName: z.string(),
    reason: z.string().min(10).max(500),
    patch: z
      .record(z.string(), z.unknown())
      .refine(
        (value) =>
          Object.keys(value).every(
            (key) => key in submissionSchema.shape && key !== "connections",
          ),
        "Only editable listing fields belong in patch.",
      ),
    connections: z.array(connectionSchema.omit({ id: true })).max(25),
    sources: listingSchema.shape.referenceSources.min(1),
  }),
);
export async function applyEnrichment(input: unknown) {
  const records = researchSchema.parse(input);
  const completed: string[] = [];
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    for (const record of records) {
      const { rows } = await client.query(
        "SELECT * FROM listings WHERE id=$1 FOR UPDATE",
        [record.id],
      );
      const old = rows[0];
      if (
        !old ||
        old.name !== record.expectedName ||
        old.version !== record.expectedVersion
      )
        throw new Error(
          `Stale or mismatched entry: ${record.expectedName}. Review again; no batch changes applied.`,
        );
      const added = record.connections.map((link) => ({
        ...link,
        id:
          old.connections.find(
            (existing: { url: string; id: string }) =>
              existing.url === link.url,
          )?.id ?? randomUUID(),
      }));
      const connections = [
        ...added,
        ...old.connections
          .filter(
            (link: Connection) => !added.some((item) => item.url === link.url),
          )
          .map((link: Connection) => ({
            ...link,
            type:
              link.type === "website"
                ? classifyConnection(link.url)
                : link.type,
          })),
      ];
      const entry = submissionSchema.parse({
        ...old,
        url: old.url ?? "",
        contactUrl: old.contact_url ?? "",
        location: old.location ?? "",
        accessMode: old.access_mode,
        accessInstructions: old.access_instructions,
        seekingOrganizer: old.seeking_organizer,
        publicPhone: old.public_phone,
        publicEmail: old.public_email,
        publicAddress: old.public_address,
        openingHours: old.opening_hours,
        ...record.patch,
        connections,
      });
      await client.query(
        "SELECT set_config('app.action','source-enrichment',true),set_config('app.reason',$1,true)",
        [record.reason],
      );
      entry.tags = await canonicalTags(client, entry.tags, old.tags);
      // Content and provenance share one atomic revision.
      await updateContent(client, old.id, entry, old, record.sources);
      completed.push(
        `Enriched: ${old.name} (revision ${old.version + 1}; not marked confirmed)`,
      );
    }
  });
  return completed;
}

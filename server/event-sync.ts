import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { fetchFspSnapshot } from "./fsp.js";
import { eventSources, POLL_INTERVAL_MS } from "../shared/event-sources.js";
import type { PublicEventLocation } from "../shared/event-location-fields.js";
import type { SkippedEventDiagnostic } from "../shared/event-sync-diagnostics.js";

export interface EventSnapshot {
  from: Date;
  to: Date;
  skipped: string[];
  diagnostics?: SkippedEventDiagnostic[];
  events: Array<
    Partial<PublicEventLocation> & {
      key: string;
      title: string;
      description: string;
      startsAt: Date;
      endsAt: Date;
      venue: string | null;
      url: string;
      allDay: boolean;
    }
  >;
}
export interface EventSourceAdapter {
  key: string;
  name: string;
  url: string;
  fetchSnapshot: (signal: AbortSignal) => Promise<EventSnapshot>;
}
export const adapters: EventSourceAdapter[] = [
  {
    key: "fsp_calendar",
    ...eventSources.fsp_calendar,
    fetchSnapshot: fetchFspSnapshot,
  },
];
export const automaticSyncEnabled = () =>
  process.env.FSP_SYNC_ENABLED !== "false";
export function isPollDue(lastStarted: Date | null, now = new Date()) {
  return (
    !lastStarted || now.getTime() - lastStarted.getTime() >= POLL_INTERVAL_MS
  );
}

export async function saveSnapshot(
  client: PoolClient,
  key: string,
  snapshot: EventSnapshot,
) {
  for (const e of snapshot.events) {
    await client.query(
      `INSERT INTO events (source_key,source_event_id,title,description,starts_at,ends_at,venue,url,raw_payload,
       city,address,state,postal_code,country,location_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (source_key,source_event_id) DO UPDATE SET title=EXCLUDED.title,
       description=EXCLUDED.description, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
       venue=EXCLUDED.venue, url=EXCLUDED.url,
       raw_payload=(events.raw_payload || EXCLUDED.raw_payload) - 'hidden',
       city=CASE WHEN $16 THEN EXCLUDED.city ELSE events.city END,
       address=CASE WHEN $16 THEN EXCLUDED.address ELSE events.address END,
       state=CASE WHEN $16 THEN EXCLUDED.state ELSE events.state END,
       postal_code=CASE WHEN $16 THEN EXCLUDED.postal_code ELSE events.postal_code END,
       country=CASE WHEN $16 THEN EXCLUDED.country ELSE events.country END,
       location_type=CASE WHEN $16 THEN EXCLUDED.location_type ELSE events.location_type END,
       last_synced_at=NOW(), updated_at=NOW()`,
      [
        key,
        e.key,
        e.title,
        e.description,
        e.startsAt,
        e.endsAt,
        e.venue,
        e.url,
        JSON.stringify({ allDay: e.allDay }),
        e.city ?? null,
        e.address ?? null,
        e.state ?? null,
        e.postalCode ?? null,
        e.country ?? null,
        e.locationType ?? "unknown",
        e.locationType !== undefined,
      ],
    );
  }
  // Retain past history and malformed series; only reconcile the validated window.
  await client.query(
    `UPDATE events SET raw_payload=jsonb_set(raw_payload,'{hidden}','true')
     WHERE source_key=$1 AND coalesce(ends_at,starts_at)>=$2 AND starts_at<=$3
     AND NOT (source_event_id=ANY($4::text[]))
     AND NOT (split_part(source_event_id,':',1)=ANY($5::text[]))`,
    [
      key,
      snapshot.from,
      snapshot.to,
      snapshot.events.map((e) => e.key),
      snapshot.skipped,
    ],
  );
  await client.query(
    `UPDATE source_syncs SET last_finished_at=NOW(),last_successful_at=NOW(),last_status=$2,
     last_error=NULL,item_count=$3,coverage_from=$4,coverage_to=$5,skipped_count=$6,
     skipped_diagnostics=$7::jsonb,diagnostics_at=NOW() WHERE source_key=$1`,
    [
      key,
      snapshot.skipped.length ? "partial" : "ok",
      snapshot.events.length,
      snapshot.from,
      snapshot.to,
      snapshot.skipped.length,
      JSON.stringify(
        snapshot.skipped.map(
          (sourceEventId) =>
            snapshot.diagnostics?.find(
              (entry) => entry.sourceEventId === sourceEventId,
            ) ?? {
              sourceEventId,
              code: "unspecified",
              reason:
                "The source adapter skipped this series without a detailed reason.",
            },
        ),
      ),
    ],
  );
}

// One lock covers fetching AND saving across timers, CLI runs and app replicas.
export async function syncEventSource(
  adapter: EventSourceAdapter,
  force = false,
) {
  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      ["event-sync:" + adapter.key],
    );
    locked = lock.rows[0].locked;
    if (!locked) return { status: "already_running" };
    await client.query(
      `INSERT INTO source_syncs(source_key,display_name,source_url) VALUES ($1,$2,$3)
       ON CONFLICT (source_key) DO NOTHING`,
      [adapter.key, adapter.name, adapter.url],
    );
    const previous = await client.query(
      "SELECT last_started_at,last_status FROM source_syncs WHERE source_key=$1",
      [adapter.key],
    );
    // With the session lock acquired, a persisted 'running' state is an interrupted run.
    if (
      !force &&
      previous.rows[0].last_status !== "running" &&
      !isPollDue(previous.rows[0].last_started_at)
    )
      return { status: "not_due" };
    await client.query(
      "UPDATE source_syncs SET last_started_at=NOW(),last_status='running',last_error=NULL WHERE source_key=$1",
      [adapter.key],
    );
    try {
      const snapshot = await adapter.fetchSnapshot(AbortSignal.timeout(180000));
      await client.query("BEGIN");
      await saveSnapshot(client, adapter.key, snapshot);
      await client.query("COMMIT");
      return {
        status: snapshot.skipped.length ? "partial" : "ok",
        count: snapshot.events.length,
        skipped: snapshot.skipped,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      await client.query(
        "UPDATE source_syncs SET last_finished_at=NOW(),last_status='error',last_error=$2 WHERE source_key=$1",
        [
          adapter.key,
          "The source could not be refreshed. Previously imported events have been kept.",
        ],
      );
      throw error;
    }
  } finally {
    try {
      if (locked)
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
          "event-sync:" + adapter.key,
        ]);
      client.release();
    } catch {
      client.release(true);
    }
  }
}

export function startEventScheduler() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  async function tick() {
    for (const adapter of adapters) {
      if (stopped) break;
      try {
        const result = await syncEventSource(adapter);
        if (result.status !== "not_due")
          console.log("Event sync", adapter.key, JSON.stringify(result));
      } catch (error) {
        console.error(
          "Event sync failed",
          adapter.key,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
    if (!stopped)
      timer = setTimeout(() => {
        pending = tick();
      }, 60000);
  }
  if (automaticSyncEnabled()) pending = tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pending;
  };
}

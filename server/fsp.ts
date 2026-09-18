import { pool } from "./db.js";

type IcsEvent = {
  uid: string;
  summary: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  url: string | null;
};

function unfoldIcs(input: string) {
  return input.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function parseIcsDate(value: string) {
  const normalized = value.replace(/[^0-9TZ]/g, "");
  if (/^\d{8}$/.test(normalized)) {
    return new Date(`${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T00:00:00Z`);
  }
  const utc = normalized.endsWith("Z");
  const digits = normalized.replace(/Z$/, "");
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(9, 11)}:${digits.slice(11, 13)}:${digits.slice(13, 15)}${utc ? "Z" : ""}`;
  return new Date(iso);
}

function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const lines = unfoldIcs(block.split("END:VEVENT")[0]);
    const fields = new Map<string, string>();
    for (const line of lines) {
      const separator = line.indexOf(":");
      if (separator === -1) continue;
      const key = line.slice(0, separator).split(";")[0].toUpperCase();
      if (!fields.has(key)) fields.set(key, unescapeIcs(line.slice(separator + 1)));
    }
    const uid = fields.get("UID");
    const summary = fields.get("SUMMARY");
    const startValue = fields.get("DTSTART");
    if (!uid || !summary || !startValue) continue;
    const startsAt = parseIcsDate(startValue);
    if (Number.isNaN(startsAt.getTime())) continue;
    const endValue = fields.get("DTEND");
    const endsAt = endValue ? parseIcsDate(endValue) : null;
    events.push({ uid, summary, description: fields.get("DESCRIPTION") ?? "", startsAt, endsAt, location: fields.get("LOCATION") || null, url: fields.get("URL") || null });
  }
  return events;
}

export async function syncFspCalendar(feedUrl: string) {
  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`FSP calendar responded with ${response.status}.`);
  const events = parseIcs(await response.text());
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const event of events) {
      await client.query(
        `INSERT INTO events (source_key, source_event_id, title, description, starts_at, ends_at, venue, url, raw_payload, last_synced_at)
         VALUES ('fsp_calendar', $1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (source_key, source_event_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
           starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, venue = EXCLUDED.venue, url = EXCLUDED.url,
           raw_payload = EXCLUDED.raw_payload, last_synced_at = NOW(), updated_at = NOW()`,
        [event.uid, event.summary, event.description, event.startsAt, event.endsAt, event.location, event.url, JSON.stringify(event)]
      );
    }
    await client.query(
      `UPDATE source_syncs SET last_finished_at = NOW(), last_status = 'ok', last_error = NULL, item_count = $1 WHERE source_key = 'fsp_calendar'`,
      [events.length]
    );
    await client.query("COMMIT");
    return events.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

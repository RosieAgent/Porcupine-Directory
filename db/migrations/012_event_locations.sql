-- Additive only: existing event IDs, location text and sync history are retained.
ALTER TABLE events ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'unknown'
  CHECK (location_type IN ('physical', 'online', 'undisclosed', 'unknown'));
-- Reasons describe the last successful (possibly partial) snapshot, not a failed attempt.
ALTER TABLE source_syncs ADD COLUMN IF NOT EXISTS skipped_diagnostics JSONB NOT NULL DEFAULT '[]';
ALTER TABLE source_syncs ADD COLUMN IF NOT EXISTS diagnostics_at TIMESTAMPTZ;

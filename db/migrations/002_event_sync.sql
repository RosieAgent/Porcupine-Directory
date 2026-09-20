ALTER TABLE source_syncs ADD COLUMN IF NOT EXISTS last_successful_at TIMESTAMPTZ;
ALTER TABLE source_syncs ADD COLUMN IF NOT EXISTS coverage_from TIMESTAMPTZ;
ALTER TABLE source_syncs ADD COLUMN IF NOT EXISTS coverage_to TIMESTAMPTZ;
ALTER TABLE source_syncs ADD COLUMN IF NOT EXISTS skipped_count INTEGER NOT NULL DEFAULT 0;
UPDATE source_syncs SET last_successful_at=last_finished_at
WHERE last_successful_at IS NULL AND last_status IN ('ok','partial');

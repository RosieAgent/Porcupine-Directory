ALTER TABLE service_accounts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE service_accounts
  DROP CONSTRAINT IF EXISTS service_accounts_name_environment_key;

CREATE UNIQUE INDEX IF NOT EXISTS service_accounts_name_environment_active_idx
  ON service_accounts(name, environment)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS service_accounts_active_idx;
CREATE INDEX service_accounts_active_idx
  ON service_accounts(environment, expires_at)
  WHERE revoked_at IS NULL AND deleted_at IS NULL;

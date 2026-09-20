CREATE TABLE IF NOT EXISTS service_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('development','staging','production')),
  scopes text[] NOT NULL DEFAULT '{}',
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_used_ip text,
  UNIQUE (name, environment)
);
CREATE INDEX IF NOT EXISTS service_accounts_active_idx
  ON service_accounts(environment, expires_at)
  WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS service_request_dedup (
  service_account_id uuid NOT NULL REFERENCES service_accounts(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_account_id, idempotency_key)
);

ALTER TABLE security_audit
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS subject_type text NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'success';
ALTER TABLE security_audit
  DROP CONSTRAINT IF EXISTS security_audit_actor_type_check;
ALTER TABLE security_audit
  ADD CONSTRAINT security_audit_actor_type_check
  CHECK (actor_type IN ('account','service_account','system'));

ALTER TABLE listing_revisions
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE listing_revisions
  DROP CONSTRAINT IF EXISTS listing_revisions_actor_type_check;
ALTER TABLE listing_revisions
  ADD CONSTRAINT listing_revisions_actor_type_check
  CHECK (actor_type IN ('account','service_account','system'));

CREATE OR REPLACE FUNCTION audit_listing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO listing_revisions(
    listing_id,version,actor_id,actor_type,request_id,action,reason,details,before_data,after_data
  )
  VALUES (
    NEW.id,
    NEW.version,
    NULLIF(current_setting('app.actor',true),'')::uuid,
    COALESCE(NULLIF(current_setting('app.actor_type',true),''),'system'),
    NULLIF(current_setting('app.request_id',true),''),
    COALESCE(NULLIF(current_setting('app.action',true),''),'system'),
    COALESCE(current_setting('app.reason',true),''),
    COALESCE(NULLIF(current_setting('app.details',true),''),'{}')::jsonb,
    CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)-'search_vector' ELSE NULL END,
    to_jsonb(NEW)-'search_vector'
  );
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  alias text NOT NULL DEFAULT 'Anonymous',
  password_hash text NOT NULL,
  recovery_hash text NOT NULL,
  recovery_saved boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','editor','administrator')),
  privileges_suspended boolean NOT NULL DEFAULT false,
  session_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS passkeys (
  id text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL,
  transports jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passkeys_account ON passkeys(account_id);
CREATE TABLE IF NOT EXISTS recovery_emails (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  address_encrypted text,
  pending_encrypted text,
  verification_hash text,
  verification_expires timestamptz,
  reset_hash text,
  reset_expires timestamptz
);
CREATE TABLE IF NOT EXISTS sessions (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expire ON sessions(expire);
CREATE TABLE IF NOT EXISTS security_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  subject_id uuid,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_buckets (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS auth_challenges (
  session_key text NOT NULL,
  purpose text NOT NULL,
  challenge text NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(session_key,purpose)
);
CREATE TABLE IF NOT EXISTS bookmarks (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  PRIMARY KEY(account_id, listing_id)
);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES accounts(id);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS locally_edited boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS self_confirmed_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS editor_reviewed_at timestamptz;
CREATE TABLE IF NOT EXISTS listing_revisions (
  listing_id uuid NOT NULL REFERENCES listings(id),
  version integer NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  before_data jsonb,
  after_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(listing_id, version)
);
CREATE OR REPLACE FUNCTION listing_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  IF ROW(NEW.kind,NEW.name,NEW.summary,NEW.description,NEW.url,NEW.contact_url,NEW.location,NEW.tags,NEW.access_mode,NEW.access_instructions,NEW.links)
    IS DISTINCT FROM ROW(OLD.kind,OLD.name,OLD.summary,OLD.description,OLD.url,OLD.contact_url,OLD.location,OLD.tags,OLD.access_mode,OLD.access_instructions,OLD.links) THEN
    NEW.self_confirmed_at := NULL;
    NEW.editor_reviewed_at := NULL;
    NEW.last_confirmed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION audit_listing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO listing_revisions(listing_id,version,actor_id,action,reason,before_data,after_data)
  VALUES (NEW.id,NEW.version,NULLIF(current_setting('app.actor',true),'')::uuid,
    COALESCE(NULLIF(current_setting('app.action',true),''),'system'),
    COALESCE(current_setting('app.reason',true),''),
    CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)-'search_vector' ELSE NULL END,
    to_jsonb(NEW)-'search_vector');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS listing_version_trigger ON listings;
CREATE TRIGGER listing_version_trigger BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION listing_version();
DROP TRIGGER IF EXISTS listing_audit_trigger ON listings;
CREATE TRIGGER listing_audit_trigger AFTER INSERT OR UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION audit_listing();
INSERT INTO listing_revisions(listing_id,version,action,after_data)
SELECT id,version,'baseline',to_jsonb(listings)-'search_vector' FROM listings ON CONFLICT DO NOTHING;

ALTER TABLE events ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS event_revisions (
  event_id uuid NOT NULL REFERENCES events(id),
  version integer NOT NULL,
  source_key text NOT NULL,
  before_data jsonb,
  after_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,version)
);
CREATE OR REPLACE FUNCTION event_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['last_synced_at','updated_at','version']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['last_synced_at','updated_at','version']) THEN
    NEW.version := OLD.version + 1;
  ELSE NEW.version := OLD.version;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.version<>OLD.version THEN
    INSERT INTO event_revisions(event_id,version,source_key,before_data,after_data)
    VALUES (NEW.id,NEW.version,NEW.source_key,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS event_version_trigger ON events;
CREATE TRIGGER event_version_trigger BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION event_version();
DROP TRIGGER IF EXISTS event_audit_trigger ON events;
CREATE TRIGGER event_audit_trigger AFTER INSERT OR UPDATE ON events FOR EACH ROW EXECUTE FUNCTION audit_event();
INSERT INTO event_revisions(event_id,version,source_key,after_data)
SELECT id,version,source_key,to_jsonb(events) FROM events ON CONFLICT DO NOTHING;

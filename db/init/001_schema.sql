CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('group', 'channel', 'business', 'resource')),
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT,
  contact_url TEXT,
  location TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  access_mode TEXT NOT NULL DEFAULT 'unknown' CHECK (access_mode IN ('open', 'public', 'invite_only', 'private', 'unknown')),
  access_instructions TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL DEFAULT 'Community submission',
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'published', 'archived')),
  last_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listings_status_idx ON listings (status);
CREATE INDEX IF NOT EXISTS listings_kind_idx ON listings (kind);
CREATE INDEX IF NOT EXISTS listings_access_mode_idx ON listings (access_mode);
CREATE INDEX IF NOT EXISTS listings_search_idx ON listings USING GIN (
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '') || ' ' || array_to_string(tags, ' '))
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  venue TEXT,
  city TEXT,
  url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_key, source_event_id)
);

CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at);

CREATE TABLE IF NOT EXISTS source_syncs (
  source_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_status TEXT NOT NULL DEFAULT 'not_run',
  last_error TEXT,
  item_count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO source_syncs (source_key, display_name, source_url)
VALUES ('fsp_calendar', 'FSP Community Calendar', 'https://community.fsp.org/calendar/')
ON CONFLICT (source_key) DO NOTHING;

-- Public publisher metadata only; no subscribers or viewing history.
CREATE TABLE publication_feeds (
  source_key text PRIMARY KEY,
  items jsonb NOT NULL DEFAULT '[]',
  last_checked_at timestamptz,
  last_successful_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','error'))
);

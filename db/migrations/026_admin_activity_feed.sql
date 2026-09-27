CREATE INDEX IF NOT EXISTS security_audit_recent_idx
  ON security_audit(created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS listing_revisions_recent_idx
  ON listing_revisions(created_at DESC,listing_id,version DESC);

CREATE INDEX IF NOT EXISTS event_revisions_recent_idx
  ON event_revisions(created_at DESC,event_id,version DESC);

CREATE TABLE IF NOT EXISTS admin_activity_feed_meta (
  id integer PRIMARY KEY CHECK (id = 1),
  installed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admin_activity_feed_meta(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

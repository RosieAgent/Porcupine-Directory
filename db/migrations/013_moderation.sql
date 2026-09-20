-- Private moderation records: deliberately separate from listings and public revisions.
-- No reporter account, IP address or ownership metadata is retained here.
CREATE TABLE IF NOT EXISTS moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  reason text NOT NULL CHECK (reason IN ('incorrect','broken_link','unavailable','inappropriate','other')),
  text text NOT NULL DEFAULT '' CHECK (char_length(text) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text NOT NULL DEFAULT '' CHECK (char_length(resolution) <= 500),
  CHECK ((status='open' AND resolved_at IS NULL AND resolution='') OR
    (status<>'open' AND resolved_at IS NOT NULL AND char_length(btrim(resolution)) >= 3))
);
CREATE INDEX IF NOT EXISTS moderation_reports_entry ON moderation_reports(listing_id,created_at,id);
CREATE INDEX IF NOT EXISTS moderation_reports_open ON moderation_reports(listing_id) WHERE status='open';
CREATE TABLE IF NOT EXISTS moderation_report_audit (
  report_id uuid NOT NULL REFERENCES moderation_reports(id),
  version integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES accounts(id),
  listing_version integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('resolved','dismissed')),
  resolution text NOT NULL CHECK (char_length(btrim(resolution)) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(report_id,version)
);

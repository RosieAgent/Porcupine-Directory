CREATE TABLE IF NOT EXISTS tag_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  reason text NOT NULL,
  listing_name text NOT NULL DEFAULT '',
  submitted_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  review_reason text NOT NULL DEFAULT '',
  approved_tag_id uuid REFERENCES tag_definitions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS tag_suggestions_status_created_idx
  ON tag_suggestions(status, created_at DESC);

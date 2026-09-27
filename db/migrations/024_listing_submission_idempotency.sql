-- A client-generated idempotency key makes retries of the same submission safe.
-- The request hash prevents accidentally reusing a key for different content.
CREATE TABLE IF NOT EXISTS listing_submission_idempotency (
  idempotency_key text PRIMARY KEY CHECK (char_length(idempotency_key) BETWEEN 16 AND 200),
  request_hash text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_submission_idempotency_created_idx
  ON listing_submission_idempotency(created_at);

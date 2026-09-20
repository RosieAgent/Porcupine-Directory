-- Private maintenance offers. No owner change occurs until recipient acceptance.
CREATE TABLE ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  proposer_id uuid NOT NULL REFERENCES accounts(id),
  proposer_role text NOT NULL CHECK (proposer_role IN ('editor','administrator')),
  proposer_session_version integer NOT NULL,
  recipient_id uuid NOT NULL REFERENCES accounts(id),
  prior_owner_id uuid REFERENCES accounts(id),
  listing_version integer NOT NULL CHECK (listing_version > 0),
  listing_status text NOT NULL CHECK (listing_status IN ('published','pending_review','archived')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','declined','cancelled','expired','revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '7 days',
  resolved_at timestamptz,
  CHECK (prior_owner_id IS DISTINCT FROM recipient_id),
  CHECK (expires_at > created_at),
  CHECK ((state = 'pending') = (resolved_at IS NULL))
);
CREATE UNIQUE INDEX ownership_one_pending ON ownership_transfers(listing_id) WHERE state='pending';
CREATE INDEX ownership_inbox ON ownership_transfers(recipient_id,created_at DESC,id);

-- UUID actors only; NULL means automatic maintenance/host, never impersonation.
-- No credentials, session IDs, usernames or request bodies are copied here.
CREATE TABLE ownership_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES ownership_transfers(id),
  actor_id uuid REFERENCES accounts(id),
  action text NOT NULL CHECK (action IN ('proposed','accepted','declined','cancelled','expired','revoked')),
  cause text NOT NULL DEFAULT '' CHECK (cause IN ('','expired','proposer_changed','entry_changed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

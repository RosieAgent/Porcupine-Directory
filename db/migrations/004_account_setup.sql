-- Host-issued, short-lived setup invitations. No default/test passwords.
CREATE TABLE account_setup (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('user','editor','administrator')),
  expires_at timestamptz NOT NULL
);

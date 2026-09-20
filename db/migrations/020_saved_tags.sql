CREATE TABLE account_saved_tags (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, tag_id)
);
CREATE INDEX account_saved_tags_tag_idx ON account_saved_tags(tag_id);

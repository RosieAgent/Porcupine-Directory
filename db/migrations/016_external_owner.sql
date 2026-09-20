-- Private staff-maintained label, not a public contact or account identity.
ALTER TABLE listings ADD COLUMN external_owner_label text
  CHECK (external_owner_label IS NULL OR char_length(external_owner_label) <= 80);
ALTER TABLE listings ADD CONSTRAINT external_owner_requires_no_account
  CHECK (external_owner_label IS NULL OR owner_id IS NULL);

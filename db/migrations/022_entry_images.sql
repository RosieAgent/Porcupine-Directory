-- Entry images are part of the listing. The shareable flag records permission
-- to feature an image in community cards and other directory highlights.
CREATE TABLE IF NOT EXISTS entry_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  data bytea NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  alt_text text NOT NULL DEFAULT '' CHECK (char_length(alt_text) <= 200),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  shareable boolean NOT NULL DEFAULT false,
  is_lead boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  uploaded_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (NOT is_lead OR shareable),
  CHECK (NOT shareable OR char_length(btrim(alt_text)) >= 3)
);

CREATE INDEX IF NOT EXISTS entry_images_listing_idx
  ON entry_images(listing_id, is_lead DESC, sort_order, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS entry_images_one_lead_idx
  ON entry_images(listing_id) WHERE is_lead AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_images_active_listing_idx
  ON entry_images(listing_id, created_at) WHERE deleted_at IS NULL;

-- Image operations are child-record changes, so they are represented in the
-- security audit stream rather than pretending they are listing revisions.
CREATE INDEX IF NOT EXISTS security_audit_image_subject_idx
  ON security_audit(subject_type, subject_id, created_at DESC);

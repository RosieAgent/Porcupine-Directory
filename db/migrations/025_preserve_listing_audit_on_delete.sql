-- Listing deletion must not erase the audit trail. These records intentionally
-- retain the deleted listing UUID as historical evidence after the live row is
-- gone, so their foreign keys must not block a permanent listing deletion.
ALTER TABLE listing_revisions
  DROP CONSTRAINT IF EXISTS listing_revisions_listing_id_fkey;

ALTER TABLE ownership_transfers
  DROP CONSTRAINT IF EXISTS ownership_transfers_listing_id_fkey;

ALTER TABLE moderation_reports
  DROP CONSTRAINT IF EXISTS moderation_reports_listing_id_fkey;

COMMENT ON COLUMN listing_revisions.listing_id IS
  'Historical listing UUID; the referenced listing may have been permanently deleted.';
COMMENT ON COLUMN ownership_transfers.listing_id IS
  'Historical listing UUID; the referenced listing may have been permanently deleted.';
COMMENT ON COLUMN moderation_reports.listing_id IS
  'Historical listing UUID; the referenced listing may have been permanently deleted.';

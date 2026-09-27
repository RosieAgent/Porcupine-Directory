-- The image checkbox represents one community-card image per entry. Normalize
-- earlier image rows so the legacy shareable flag follows the unique card flag.
UPDATE entry_images
SET shareable = is_lead
WHERE deleted_at IS NULL;

UPDATE entry_images
SET shareable = false
WHERE deleted_at IS NOT NULL;

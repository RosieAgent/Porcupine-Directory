-- Preserve references supplied by an explicit source-backed update. Ordinary
-- content edits still invalidate previously recorded references when the
-- update does not provide a replacement source list.
CREATE OR REPLACE FUNCTION listing_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  IF ROW(NEW.kind,NEW.name,NEW.summary,NEW.description,NEW.url,NEW.contact_url,NEW.location,NEW.tags,NEW.access_mode,NEW.access_instructions,NEW.links,NEW.connections,NEW.lifecycle,NEW.seeking_organizer,NEW.public_phone,NEW.public_email,NEW.public_address,NEW.opening_hours)
    IS DISTINCT FROM ROW(OLD.kind,OLD.name,OLD.summary,OLD.description,OLD.url,OLD.contact_url,OLD.location,OLD.tags,OLD.access_mode,OLD.access_instructions,OLD.links,OLD.connections,OLD.lifecycle,OLD.seeking_organizer,OLD.public_phone,OLD.public_email,OLD.public_address,OLD.opening_hours) THEN
    NEW.self_confirmed_at := NULL;
    NEW.editor_reviewed_at := NULL;
    NEW.last_confirmed_at := NULL;
    IF current_setting('app.action',true) IS DISTINCT FROM 'source-enrichment'
      AND NEW.reference_sources IS NOT DISTINCT FROM OLD.reference_sources
      AND NOT (
        coalesce(current_setting('app.action',true),'') IN ('tag-catalog-migration','tag-renamed','tags-merged')
        AND ROW(NEW.kind,NEW.name,NEW.summary,NEW.description,NEW.url,NEW.contact_url,NEW.location,NEW.access_mode,NEW.access_instructions,NEW.links,NEW.connections,NEW.lifecycle,NEW.seeking_organizer,NEW.public_phone,NEW.public_email,NEW.public_address,NEW.opening_hours)
          IS NOT DISTINCT FROM ROW(OLD.kind,OLD.name,OLD.summary,OLD.description,OLD.url,OLD.contact_url,OLD.location,OLD.access_mode,OLD.access_instructions,OLD.links,OLD.connections,OLD.lifecycle,OLD.seeking_organizer,OLD.public_phone,OLD.public_email,OLD.public_address,OLD.opening_hours)
      ) THEN
      NEW.reference_sources := '[]'::jsonb;
    END IF;
  END IF;
  RETURN NEW;
END $$;

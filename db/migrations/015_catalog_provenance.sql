-- Catalog-only naming/descriptor changes invalidate confirmations, but do not
-- invalidate dated sources for otherwise unchanged facts. Ordinary content edits
-- still clear references unless they explicitly come from source enrichment.
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

-- Recover references removed by 010 only if that exact audited revision is
-- still current. Never overwrite later edits, restore ownership or grant trust.
SELECT set_config('app.action','catalog-provenance-preserved',true),
  set_config('app.reason','Preserve dated website references after descriptor-only catalog migration; no confirmation granted.',true);
UPDATE listings l SET reference_sources=r.before_data->'reference_sources'
FROM listing_revisions r
WHERE r.listing_id=l.id AND r.version=l.version
  AND r.action='tag-catalog-migration'
  AND jsonb_typeof(r.before_data->'reference_sources')='array'
  AND jsonb_array_length(r.before_data->'reference_sources')>0
  AND l.reference_sources='[]'::jsonb
  AND (r.before_data - ARRAY['tags','version','updated_at','self_confirmed_at','editor_reviewed_at','last_confirmed_at','reference_sources'])
    = (r.after_data - ARRAY['tags','version','updated_at','self_confirmed_at','editor_reviewed_at','last_confirmed_at','reference_sources']);
SELECT set_config('app.action','',true),set_config('app.reason','',true);

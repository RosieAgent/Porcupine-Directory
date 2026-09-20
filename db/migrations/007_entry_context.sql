ALTER TABLE listings DROP CONSTRAINT listings_kind_check;
ALTER TABLE listings ADD CONSTRAINT listings_kind_check CHECK (kind IN ('group','channel','business','resource','organization'));
ALTER TABLE listings ADD COLUMN lifecycle text NOT NULL DEFAULT 'unknown' CHECK (lifecycle IN ('unknown','existing','proposed'));
ALTER TABLE listings ADD COLUMN seeking_organizer boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN public_phone text NOT NULL DEFAULT '';
ALTER TABLE listings ADD COLUMN public_email text NOT NULL DEFAULT '';
ALTER TABLE listings ADD COLUMN public_address text NOT NULL DEFAULT '';
ALTER TABLE listings ADD COLUMN opening_hours text NOT NULL DEFAULT '';
ALTER TABLE listings ADD COLUMN reference_sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reference_sources)='array');

-- Missing links are not evidence that a community is merely an idea.
-- Ignore the importer's generic disclaimer/placeholder, but retain actual written guidance.
CREATE FUNCTION listing_has_joining_details(points jsonb,instructions text,phone text DEFAULT '',email text DEFAULT '') RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_array_length(points)>0 OR btrim(phone)<>'' OR btrim(email)<>'' OR (
    btrim(regexp_replace(coalesce(instructions,''),
      'Joining details have not been provided\. Check the source document for updates\.|Access has not been independently verified\. A listed link does not guarantee admission\.|Participation details have not been confirmed\.', '', 'gi')) !~* '^\s*(unknown|n/a|none|tbd|not provided|\?*)\s*$'
  );
$$;

CREATE OR REPLACE FUNCTION listing_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  IF ROW(NEW.kind,NEW.name,NEW.summary,NEW.description,NEW.url,NEW.contact_url,NEW.location,NEW.tags,NEW.access_mode,NEW.access_instructions,NEW.links,NEW.connections,NEW.lifecycle,NEW.seeking_organizer,NEW.public_phone,NEW.public_email,NEW.public_address,NEW.opening_hours)
    IS DISTINCT FROM ROW(OLD.kind,OLD.name,OLD.summary,OLD.description,OLD.url,OLD.contact_url,OLD.location,OLD.tags,OLD.access_mode,OLD.access_instructions,OLD.links,OLD.connections,OLD.lifecycle,OLD.seeking_organizer,OLD.public_phone,OLD.public_email,OLD.public_address,OLD.opening_hours) THEN
    NEW.self_confirmed_at := NULL;
    NEW.editor_reviewed_at := NULL;
    NEW.last_confirmed_at := NULL;
    -- References stay historical but must not appear to support newly edited content.
    IF current_setting('app.action',true) IS DISTINCT FROM 'source-enrichment' THEN
      NEW.reference_sources := '[]'::jsonb;
    END IF;
  END IF;
  RETURN NEW;
END $$;

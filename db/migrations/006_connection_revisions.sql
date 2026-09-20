CREATE OR REPLACE FUNCTION listing_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  IF ROW(NEW.kind,NEW.name,NEW.summary,NEW.description,NEW.url,NEW.contact_url,NEW.location,NEW.tags,NEW.access_mode,NEW.access_instructions,NEW.links,NEW.connections)
    IS DISTINCT FROM ROW(OLD.kind,OLD.name,OLD.summary,OLD.description,OLD.url,OLD.contact_url,OLD.location,OLD.tags,OLD.access_mode,OLD.access_instructions,OLD.links,OLD.connections) THEN
    NEW.self_confirmed_at := NULL;
    NEW.editor_reviewed_at := NULL;
    NEW.last_confirmed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

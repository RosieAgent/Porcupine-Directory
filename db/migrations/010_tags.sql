CREATE TABLE tag_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  icon text NOT NULL DEFAULT 'tag', retired boolean NOT NULL DEFAULT false,
  merged_into uuid REFERENCES tag_definitions(id), version integer NOT NULL DEFAULT 1,
  CHECK (merged_into IS NULL OR merged_into<>id)
);
CREATE TABLE tag_names (
  key text PRIMARY KEY, name text NOT NULL, tag_id uuid NOT NULL REFERENCES tag_definitions(id)
);
CREATE INDEX tag_names_tag_idx ON tag_names(tag_id);
CREATE TABLE tag_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tag_id uuid NOT NULL REFERENCES tag_definitions(id),
  actor_id uuid, action text NOT NULL, reason text NOT NULL, before_data jsonb, after_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tag_definitions(name)
SELECT DISTINCT ON (lower(btrim(name))) btrim(name)
FROM (SELECT unnest(tags) AS name FROM listings UNION SELECT 'Business' UNION SELECT 'Nonprofit') names
WHERE btrim(name)<>'' ORDER BY lower(btrim(name)),btrim(name);
INSERT INTO tag_names(key,name,tag_id) SELECT lower(name),name,id FROM tag_definitions;
-- Add reviewed descriptors without dropping legacy kind data or changing stable entry IDs.
SELECT set_config('app.action','tag-catalog-migration',true),set_config('app.reason','Add Business descriptor to existing businesses and Nonprofit to the sourced Free State Project entry; preserve legacy routes and original history.',true);
UPDATE listings SET tags=array_append(tags,'Business') WHERE kind='business' AND NOT ('Business'=ANY(tags));
UPDATE listings SET tags=array_append(tags,'Nonprofit') WHERE id='2a193762-5ece-478d-80f3-3a9e58421212' AND NOT ('Nonprofit'=ANY(tags));
SELECT set_config('app.action','',true),set_config('app.reason','',true);

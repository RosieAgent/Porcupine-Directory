-- Owner-requested local catalog cleanup. Explicit targets, not a blanket rename.
-- Run with psql -X -v ON_ERROR_STOP=1 after a database backup.
-- Audit actor is NULL (host maintenance), never impersonate an account.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(4350010);

DO $$
BEGIN
  PERFORM id FROM tag_definitions WHERE id IN (
    '5dacd8be-6b6a-495e-b734-4b31fa542d40',
    'e791c65b-ddb4-404a-b67b-f0000726cb5b',
    '30e1be7d-49ce-494b-8201-606f5d76301f',
    'eff6de52-0d2a-4e0b-a931-8fd02bb622be',
    '171f4849-c7f1-48f0-abc4-5f4960cde839',
    'd6a07cc0-46f2-473d-a180-09cf67a4f557'
  ) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM tag_definitions WHERE version=1 AND NOT retired AND merged_into IS NULL AND
    (id,name) IN (
      ('5dacd8be-6b6a-495e-b734-4b31fa542d40'::uuid,'Telegram'),
      ('e791c65b-ddb4-404a-b67b-f0000726cb5b'::uuid,'Telegram @BarterTowne'),
      ('30e1be7d-49ce-494b-8201-606f5d76301f'::uuid,'Telegram @ManchPorcs'),
      ('eff6de52-0d2a-4e0b-a931-8fd02bb622be'::uuid,'Telegram @ShireSociety'),
      ('171f4849-c7f1-48f0-abc4-5f4960cde839'::uuid,'Both on facebook and Telegram more updates on Facebook'),
      ('d6a07cc0-46f2-473d-a180-09cf67a4f557'::uuid,'Facebook')
    )) <> 6 THEN
    RAISE EXCEPTION 'Catalog changed or cleanup already applied; recheck before proceeding.';
  END IF;
END $$;

CREATE TEMP TABLE telegram_merge_sources ON COMMIT DROP AS
SELECT id FROM tag_definitions WHERE id IN (
  'e791c65b-ddb4-404a-b67b-f0000726cb5b',
  '30e1be7d-49ce-494b-8201-606f5d76301f',
  'eff6de52-0d2a-4e0b-a931-8fd02bb622be',
  '171f4849-c7f1-48f0-abc4-5f4960cde839'
);
CREATE TEMP TABLE telegram_tag_before ON COMMIT DROP AS
SELECT d.id,to_jsonb(d) || jsonb_build_object('aliases',
  (SELECT jsonb_agg(n.name ORDER BY n.name) FROM tag_names n WHERE n.tag_id=d.id)) AS snapshot
FROM tag_definitions d WHERE d.id IN (SELECT id FROM telegram_merge_sources)
  OR d.id='5dacd8be-6b6a-495e-b734-4b31fa542d40';

DO $$ BEGIN
  PERFORM l.id FROM listings l WHERE EXISTS (
    SELECT 1 FROM unnest(l.tags) t JOIN tag_names n ON n.key=lower(t)
    WHERE n.tag_id IN (SELECT id FROM telegram_merge_sources)
  ) ORDER BY l.id FOR UPDATE;
END $$;
CREATE TEMP TABLE telegram_entry_before ON COMMIT DROP AS
SELECT l.id,to_jsonb(l) AS snapshot FROM listings l WHERE EXISTS (
  SELECT 1 FROM unnest(l.tags) t JOIN tag_names n ON n.key=lower(t)
  WHERE n.tag_id IN (SELECT id FROM telegram_merge_sources)
);
DO $$ BEGIN
  IF (SELECT count(*) FROM telegram_entry_before)<>4 THEN
    RAISE EXCEPTION 'Affected entry count changed; review before proceeding.';
  END IF;
END $$;

SELECT set_config('app.actor','',true),set_config('app.action','tags-merged',true),
  set_config('app.reason','Owner-requested Telegram tag cleanup: consolidate named variants; split the combined Facebook/Telegram label while retaining descriptions, connections and old filter aliases.',true);
UPDATE listings l SET tags=ARRAY(
  SELECT name FROM (
    SELECT CASE WHEN EXISTS(SELECT 1 FROM tag_names n WHERE n.key=lower(t.name)
      AND n.tag_id IN (SELECT id FROM telegram_merge_sources)) THEN 'Telegram' ELSE t.name END AS name,t.ordinality
    FROM unnest(l.tags) WITH ORDINALITY AS t(name,ordinality)
    UNION ALL SELECT 'Facebook',cardinality(l.tags)+1
    WHERE EXISTS(SELECT 1 FROM unnest(l.tags) t JOIN tag_names n ON n.key=lower(t)
      WHERE n.tag_id='171f4849-c7f1-48f0-abc4-5f4960cde839')
  ) names GROUP BY name ORDER BY min(ordinality)
),locally_edited=true WHERE id IN (SELECT id FROM telegram_entry_before);

UPDATE tag_names SET tag_id='5dacd8be-6b6a-495e-b734-4b31fa542d40'
WHERE tag_id IN (SELECT id FROM telegram_merge_sources);
UPDATE tag_definitions SET retired=true,merged_into='5dacd8be-6b6a-495e-b734-4b31fa542d40',version=version+1
WHERE id IN (SELECT id FROM telegram_merge_sources);
UPDATE tag_definitions SET version=version+1 WHERE id='5dacd8be-6b6a-495e-b734-4b31fa542d40';
INSERT INTO tag_revisions(tag_id,actor_id,action,reason,before_data,after_data)
SELECT d.id,NULL,CASE WHEN d.merged_into IS NULL THEN 'merge-target' ELSE 'merge-source' END,
  current_setting('app.reason'),b.snapshot,to_jsonb(d) || jsonb_build_object('aliases',
  (SELECT jsonb_agg(n.name ORDER BY n.name) FROM tag_names n WHERE n.tag_id=d.id))
FROM tag_definitions d JOIN telegram_tag_before b ON b.id=d.id;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM telegram_entry_before b JOIN listings l ON l.id=b.id
    WHERE (to_jsonb(l)-ARRAY['tags','version','updated_at','locally_edited','search_vector','self_confirmed_at','editor_reviewed_at','last_confirmed_at'])
      IS DISTINCT FROM (b.snapshot-ARRAY['tags','version','updated_at','locally_edited','search_vector','self_confirmed_at','editor_reviewed_at','last_confirmed_at'])) THEN
    RAISE EXCEPTION 'Non-tag content changed; rolling back.';
  END IF;
  IF EXISTS(SELECT 1 FROM listings l JOIN telegram_entry_before b ON l.id=b.id
    WHERE NOT ('Telegram'=ANY(l.tags))) THEN
    RAISE EXCEPTION 'Canonical Telegram tag missing; rolling back.';
  END IF;
END $$;
COMMIT;

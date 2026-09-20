ALTER TABLE listings ADD COLUMN connections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(connections)='array');
CREATE INDEX listings_connections_idx ON listings USING gin(connections jsonb_path_ops);
-- migrate.ts backfills with the shared URL classifier before 006 enables invalidation.

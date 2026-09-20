-- The one-shot migration service runs as the database owner. The web process
-- uses porcupine_app in production and must not be able to run DDL or grant
-- privileges. This is a no-op for local preview databases without that role.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'porcupine_app') THEN
    EXECUTE 'REVOKE CREATE ON SCHEMA public FROM PUBLIC';
    EXECUTE 'GRANT USAGE ON SCHEMA public TO porcupine_app';
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO porcupine_app';
    EXECUTE 'GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO porcupine_app';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO porcupine_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO porcupine_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO porcupine_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO porcupine_app';
    EXECUTE 'REVOKE UPDATE,DELETE ON security_audit,listing_revisions,event_revisions,ownership_audit,moderation_report_audit,tag_revisions FROM porcupine_app';
    EXECUTE 'REVOKE ALL ON schema_migrations FROM porcupine_app';
  END IF;
END
$$;

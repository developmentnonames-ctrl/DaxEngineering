DO $$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspowner = 'dax_owner'::regrole AND nspname <> 'public' AND nspname NOT LIKE 'pg\_%'
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO dax_app, dax_backup', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO dax_app', s);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO dax_app', s);
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO dax_backup', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE dax_owner IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dax_app', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE dax_owner IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO dax_app', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE dax_owner IN SCHEMA %I GRANT SELECT ON TABLES TO dax_backup', s);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit.audit_log', 'inventory.stock_ledger'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM dax_app', t);
    END IF;
  END LOOP;
END $$;

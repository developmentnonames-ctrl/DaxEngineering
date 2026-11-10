-- One-time setup of DAX roles and databases on a Postgres installed on the
-- developer's PC (instead of the Docker container). Same as initdb/00-roles.sh.
-- Run as the postgres superuser: pnpm db:native:setup
--
-- Passwords come in as psql variables (-v migrator_pw=... etc.), taken from
-- .env by the setup script, so this file holds no secrets.
\set ON_ERROR_STOP on

SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dax_owner') AS need_roles \gset
\if :need_roles
  -- CREATEDB lets the test-database script recreate dax_test without the
  -- superuser password (the migrator signs in as dax_owner). Dev machines
  -- only; production has no such grant.
  CREATE ROLE dax_owner NOLOGIN CREATEDB;
  CREATE ROLE dax_migrator LOGIN PASSWORD :'migrator_pw' IN ROLE dax_owner;
  CREATE ROLE dax_app LOGIN PASSWORD :'app_pw';
  CREATE ROLE dax_backup LOGIN PASSWORD :'backup_pw';
\else
  ALTER ROLE dax_owner CREATEDB;
  ALTER ROLE dax_migrator PASSWORD :'migrator_pw';
  ALTER ROLE dax_app PASSWORD :'app_pw';
  ALTER ROLE dax_backup PASSWORD :'backup_pw';
\endif
ALTER ROLE dax_migrator SET role = 'dax_owner';
ALTER ROLE dax_app SET statement_timeout = '15s';
ALTER ROLE dax_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE dax_app SET timezone = 'UTC';
ALTER ROLE dax_backup SET default_transaction_read_only = on;

SELECT NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') AS need_db \gset
\if :need_db
  CREATE DATABASE :"db" OWNER dax_owner;
\endif
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO dax_migrator, dax_app, dax_backup;

SELECT NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db' || '_shadow') AS need_shadow \gset
\if :need_shadow
  SELECT :'db' || '_shadow' AS shadow \gset
  CREATE DATABASE :"shadow" OWNER dax_owner;
\endif
SELECT :'db' || '_shadow' AS shadow \gset
REVOKE ALL ON DATABASE :"shadow" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"shadow" TO dax_migrator;

\connect :db
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO dax_owner;
\connect :shadow
ALTER SCHEMA public OWNER TO dax_owner;

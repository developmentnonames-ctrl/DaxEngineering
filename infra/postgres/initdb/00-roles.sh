#!/bin/sh
set -eu

: "${DAX_DB_NAME:=dax}"
: "${DAX_MIGRATOR_PASSWORD:?DAX_MIGRATOR_PASSWORD is required}"
: "${DAX_APP_PASSWORD:?DAX_APP_PASSWORD is required}"
: "${DAX_BACKUP_PASSWORD:?DAX_BACKUP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v db="$DAX_DB_NAME" \
  -v migrator_pw="$DAX_MIGRATOR_PASSWORD" \
  -v app_pw="$DAX_APP_PASSWORD" \
  -v backup_pw="$DAX_BACKUP_PASSWORD" <<'EOSQL'
CREATE ROLE dax_owner NOLOGIN;
CREATE ROLE dax_migrator LOGIN PASSWORD :'migrator_pw' IN ROLE dax_owner;
ALTER ROLE dax_migrator SET role = 'dax_owner';
CREATE ROLE dax_app LOGIN PASSWORD :'app_pw';
ALTER ROLE dax_app SET statement_timeout = '15s';
ALTER ROLE dax_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE dax_app SET timezone = 'UTC';
CREATE ROLE dax_backup LOGIN PASSWORD :'backup_pw';
ALTER ROLE dax_backup SET default_transaction_read_only = on;

CREATE DATABASE :"db" OWNER dax_owner;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO dax_migrator, dax_app, dax_backup;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DAX_DB_NAME" <<'EOSQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO dax_owner;
EOSQL

if [ "${DAX_CREATE_SHADOW_DB:-false}" = "true" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v db="${DAX_DB_NAME}_shadow" <<'EOSQL'
CREATE DATABASE :"db" OWNER dax_owner;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO dax_migrator;
EOSQL
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${DAX_DB_NAME}_shadow" -c "ALTER SCHEMA public OWNER TO dax_owner;"
fi

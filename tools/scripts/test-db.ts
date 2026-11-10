// Throwaway dax_test database for *.db.spec.ts: `reset` recreates it, `run` runs the DB tests.
// Uses the Postgres installed on this PC, with the same accounts as .env.
import { execFileSync } from 'node:child_process';
import { envValue, psql as runPsql } from './native-db';

function onDatabase(key: string, db: string): string {
  const value = envValue(key);
  if (!value) throw new Error(`${key} is missing from .env`);
  const url = new URL(value);
  url.pathname = `/${db}`;
  return url.toString();
}

const MIGRATOR = onDatabase('MIGRATOR_DATABASE_URL', 'dax_test');
const APP = onDatabase('DATABASE_URL', 'dax_test');
const DB_PROJECTS = ['inventory-server'];

function run(
  cmd: string,
  args: string[],
  env: Record<string, string> = {},
  cwd?: string,
) {
  execFileSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd,
    env: { ...process.env, ...env },
  });
}

// The migrator signs in as dax_owner, which may create and drop databases
// on a dev PC (see infra/postgres/native-setup.sql), so no superuser needed.
function psql(sql: string, db = 'postgres') {
  runPsql(onDatabase('MIGRATOR_DATABASE_URL', db), ['-c', sql]);
}

function reset() {
  psql('DROP DATABASE IF EXISTS dax_test WITH (FORCE)');
  psql('CREATE DATABASE dax_test OWNER dax_owner');
  psql('REVOKE ALL ON DATABASE dax_test FROM PUBLIC');
  psql('GRANT CONNECT ON DATABASE dax_test TO dax_app, dax_migrator');
  psql('ALTER SCHEMA public OWNER TO dax_owner', 'dax_test');
  const cwd = 'libs/platform/db';
  run(
    'npx',
    ['prisma', 'migrate', 'deploy'],
    { MIGRATOR_DATABASE_URL: MIGRATOR },
    cwd,
  );
  run(
    'npx',
    ['tsx', 'scripts/apply-grants.ts'],
    { MIGRATOR_DATABASE_URL: MIGRATOR },
    cwd,
  );
}

function test() {
  for (const project of DB_PROJECTS) {
    run(
      'pnpm',
      [
        'nx',
        'run',
        `${project}:test`,
        '--skip-nx-cache',
        '--output-style=static',
      ],
      {
        TEST_DATABASE_URL: APP,
      },
    );
  }
}

const command = process.argv[2];
if (command === 'reset') reset();
else if (command === 'run') test();
else {
  console.error('usage: test-db.ts reset|run');
  process.exit(1);
}

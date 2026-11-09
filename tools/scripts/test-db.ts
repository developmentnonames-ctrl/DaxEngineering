// Throwaway dax_test database for *.db.spec.ts: `reset` recreates it, `run` runs the DB tests.
import { execFileSync } from 'node:child_process';

const MIGRATOR =
  'postgresql://dax_migrator:migrator-dev-only@localhost:55432/dax_test';
const APP = 'postgresql://dax_app:app-dev-only@localhost:55432/dax_test';
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

function psql(sql: string, db = 'postgres') {
  run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'postgres',
    '-d',
    db,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `"${sql}"`,
  ]);
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
    run('pnpm', ['nx', 'run', `${project}:test`, '--skip-nx-cache'], {
      TEST_DATABASE_URL: APP,
    });
  }
}

const command = process.argv[2];
if (command === 'reset') reset();
else if (command === 'run') test();
else {
  console.error('usage: test-db.ts reset|run');
  process.exit(1);
}

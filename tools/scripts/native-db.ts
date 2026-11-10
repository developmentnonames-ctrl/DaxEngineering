// Local development uses the Postgres installed on this PC (not Docker).
//   check  - is it reachable? (pnpm db:up, also run by pnpm dev)
//   setup  - one-time: create the DAX roles and databases (pnpm db:native:setup)
// The superuser password is never stored: psql asks for it, or set PGPASSWORD
// for that one command.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** psql from PG_BIN, the default Windows install folder, or PATH. */
export function psqlPath(): string {
  const dirs = [
    process.env['PG_BIN'],
    'C:/Program Files/PostgreSQL/18/bin',
  ].filter((d): d is string => Boolean(d));
  for (const dir of dirs) {
    const exe = join(dir, process.platform === 'win32' ? 'psql.exe' : 'psql');
    if (existsSync(exe)) return exe;
  }
  return 'psql';
}

/** Values from .env (process env wins), without loading a library. */
export function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync('.env')) return undefined;
  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim();
}

export function psql(
  url: string,
  args: string[],
  stdio: 'inherit' | 'pipe' = 'inherit',
): string {
  const out = execFileSync(
    psqlPath(),
    [url, '-v', 'ON_ERROR_STOP=1', ...args],
    {
      stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );
  return out ?? '';
}

function check(): void {
  const url = envValue('MIGRATOR_DATABASE_URL');
  if (!url) throw new Error('MIGRATOR_DATABASE_URL is missing from .env');
  try {
    psql(url, ['-At', '-c', 'select 1'], 'pipe');
    const { hostname, port } = new URL(url);
    console.log(`Postgres is up on ${hostname}:${port || 5432}.`);
  } catch {
    console.error(
      [
        'Cannot reach Postgres with MIGRATOR_DATABASE_URL.',
        '  Start it: Services > "postgresql-x64-18" > Start',
        '  (or in an admin PowerShell: Start-Service postgresql-x64-18).',
        '  First time on this PC? Run: pnpm db:native:setup',
      ].join('\n'),
    );
    process.exit(1);
  }
}

function setup(): void {
  const password = (key: string) => {
    const url = envValue(key);
    if (!url) throw new Error(`${key} is missing from .env`);
    return decodeURIComponent(new URL(url).password);
  };
  const main = new URL(envValue('MIGRATOR_DATABASE_URL') ?? '');
  const superuser = `postgresql://postgres@${main.hostname}:${main.port || 5432}/postgres`;
  console.log(
    `Setting up DAX roles on ${main.hostname}:${main.port || 5432} as postgres.`,
  );
  psql(superuser, [
    '-v',
    `migrator_pw=${password('MIGRATOR_DATABASE_URL')}`,
    '-v',
    `app_pw=${password('DATABASE_URL')}`,
    '-v',
    `backup_pw=${envValue('DAX_BACKUP_PASSWORD') ?? 'backup-dev-only'}`,
    '-v',
    `db=${main.pathname.slice(1) || 'dax'}`,
    '-f',
    'infra/postgres/native-setup.sql',
  ]);
  console.log('Done. Next: pnpm db:deploy (migrations), then pnpm dev.');
}

// Run as a command only when started directly, not when test-db.ts imports it.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('native-db.ts')) {
  const command = process.argv[2];
  if (command === 'check') check();
  else if (command === 'setup') setup();
  else {
    console.error('usage: native-db.ts check|setup');
    process.exit(1);
  }
}

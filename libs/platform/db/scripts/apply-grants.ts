import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

async function main(): Promise<void> {
  const url = process.env['MIGRATOR_DATABASE_URL'];
  if (!url) throw new Error('MIGRATOR_DATABASE_URL is not set');
  const sql = readFileSync(
    join(__dirname, '..', 'prisma', 'sql', 'grants.sql'),
    'utf8',
  );
  const client = new Client({
    connectionString: url,
    application_name: 'dax-migrate',
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Grants applied.');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

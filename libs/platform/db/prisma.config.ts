import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env['MIGRATOR_DATABASE_URL'] ?? '',
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});

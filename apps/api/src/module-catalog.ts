import type { Type } from '@nestjs/common';
import { assertCatalog, type ModuleManifest } from '@dax/contracts';
import { inventoryManifest } from '@dax/inventory-contract';
import {
  INVENTORY_ENTITIES,
  InventoryServerModule,
} from '@dax/inventory-server';
import { partiesManifest } from '@dax/parties-contract';
import { PARTIES_ENTITIES, PartiesServerModule } from '@dax/parties-server';
import { coreManifest } from '@dax/platform-contract';
import type { EntityDef } from '@dax/platform-core';
import { Client } from 'pg';

export const INSTALLED_MODULES: readonly ModuleManifest[] = assertCatalog([
  coreManifest,
  partiesManifest,
  inventoryManifest,
]);

export const MODULE_ENTITIES: readonly EntityDef[] = [
  ...PARTIES_ENTITIES,
  ...INVENTORY_ENTITIES,
];

export const MODULE_SERVERS: Readonly<Record<string, Type<unknown>>> = {
  parties: PartiesServerModule,
  inventory: InventoryServerModule,
};

export async function loadEnabledModules(
  databaseUrl: string,
): Promise<ReadonlySet<string>> {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: 'dax-api-boot',
  });
  try {
    await client.connect();
  } catch {
    const { hostname, port } = new URL(databaseUrl);
    throw new Error(
      `Cannot reach the database at ${hostname}:${port || 5432}. Is Postgres running? (locally: pnpm db:up)`,
    );
  }
  try {
    const exists = await client.query<{ ok: boolean }>(
      "SELECT to_regclass('core.module') IS NOT NULL AS ok",
    );
    const total = await client.query<{ n: string }>(
      exists.rows[0]?.ok
        ? 'SELECT count(*) AS n FROM core.module'
        : 'SELECT 0 AS n',
    );
    if (Number(total.rows[0]?.n ?? 0) === 0) {
      return new Set(INSTALLED_MODULES.map((m) => m.key));
    }
    const rows = await client.query<{ key: string }>(
      'SELECT key FROM core.module WHERE enabled AND removed_at IS NULL',
    );
    return new Set(rows.rows.map((r) => r.key));
  } finally {
    await client.end();
  }
}

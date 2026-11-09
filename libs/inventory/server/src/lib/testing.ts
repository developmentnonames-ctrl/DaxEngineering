import type { AuditService, Policy } from '@dax/platform-core';
import type { PrismaService } from '@dax/platform-db';
import { INVENTORY_ENTITIES } from './entities';
import type { MainStore } from './main-store.service';

export const STORE_ID = '0190a000-0000-7000-8000-000000000001';

export function fakePolicy(permissions: string[] = []): Policy {
  const fields = new Map(
    INVENTORY_ENTITIES.map((def) => [
      def.key,
      {
        read: new Set(Object.keys(def.fields)),
        write: new Set(
          Object.entries(def.fields)
            .filter(([, meta]) => meta.writable)
            .map(([name]) => name),
        ),
      },
    ]),
  );
  return {
    userId: '0190a000-0000-7000-8000-0000000000aa',
    isSuperAdmin: false,
    require2fa: false,
    departmentIds: [],
    roleIds: [],
    enabledModules: new Set(['inventory']),
    permissions: new Map(
      permissions.map((p) => [p, { scope: 'ALL' as const, storeIds: [] }]),
    ),
    sources: new Map(),
    denied: new Set(),
    fields,
    validUntil: Number.MAX_SAFE_INTEGER,
    version: 'test',
  };
}

export function fakeAudit() {
  const entries: unknown[] = [];
  const service = {
    record: async (entry: unknown) => {
      entries.push(entry);
    },
  } as unknown as AuditService;
  return { entries, service };
}

export const fakeStore = { id: async () => STORE_ID } as unknown as MainStore;

export function asPrisma(fake: object): PrismaService {
  return fake as unknown as PrismaService;
}

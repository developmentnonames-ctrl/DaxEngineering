import { Prisma, type PrismaService } from '@dax/platform-db';
import { columnOf, type EntityDef } from '../acm/entity';
import { aadFor, activePrefix, type FieldCrypto } from './field-crypto';

const TABLE = /^[a-z_]+(\.[a-z_]+)?$/;
const COLUMN = /^[a-z_][a-z0-9_]*$/;

export interface RotationCount {
  entityKey: string;
  field: string;
  rotated: number;
}

export type RotationClient = Pick<PrismaService, '$transaction'>;

interface StaleRow {
  ctid: string;
  id: string;
  value: string;
}

function identifier(name: string, pattern: RegExp, what: string): Prisma.Sql {
  if (!pattern.test(name)) throw new Error(`Unsafe ${what} name "${name}"`);
  return Prisma.raw(
    name
      .split('.')
      .map((part) => `"${part}"`)
      .join('.'),
  );
}

export function encryptedColumns(
  entities: readonly EntityDef[],
): { def: EntityDef; field: string; table: Prisma.Sql; column: Prisma.Sql }[] {
  return entities.flatMap((def) =>
    Object.entries(def.fields)
      .filter(([, meta]) => meta.encrypted)
      .map(([field]) => ({
        def,
        field,
        table: identifier(def.table, TABLE, 'table'),
        column: identifier(columnOf(def, field), COLUMN, 'column'),
      })),
  );
}

export async function rotateEncryptedColumns(
  prisma: RotationClient,
  crypto: FieldCrypto,
  entities: readonly EntityDef[],
  batchSize = 500,
): Promise<RotationCount[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a positive integer');
  }
  const pattern = `${activePrefix(crypto.activeKeyId)}%`;
  const counts: RotationCount[] = [];
  for (const { def, field, table, column } of encryptedColumns(entities)) {
    let rotated = 0;
    for (;;) {
      const batch = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<StaleRow[]>(Prisma.sql`
          SELECT ctid::text AS ctid, id::text AS id, ${column} AS value FROM ${table}
          WHERE ${column} IS NOT NULL AND ${column} NOT LIKE ${pattern}
          ORDER BY id LIMIT ${batchSize} FOR UPDATE`);
        // Rows stay locked FOR UPDATE, so ctid is stable until this transaction writes them.
        for (const row of rows) {
          const aad = aadFor(def.key, field, row.id);
          const next = crypto.encrypt(aad, crypto.decrypt(aad, row.value));
          await tx.$executeRaw(Prisma.sql`
            UPDATE ${table} SET ${column} = ${next}
            WHERE ctid = ${row.ctid}::tid AND ${column} = ${row.value}`);
        }
        return rows.length;
      });
      rotated += batch;
      if (batch < batchSize) break;
    }
    counts.push({ entityKey: def.key, field, rotated });
  }
  return counts;
}

import { normalizePartNo } from '@dax/inventory-contract';
import type {
  Prisma,
  PrismaService,
  TransactionClient,
} from '@dax/platform-db';

type Db = PrismaService | TransactionClient;

export function itemSearch(q: string | undefined): Prisma.ItemWhereInput {
  const text = q?.trim();
  if (!text) return {};
  const norm = normalizePartNo(text);
  return {
    OR: [
      ...(norm ? [{ partNoNorm: { contains: norm } }] : []),
      { barcodes: { some: { code: text } } },
      { description: { contains: text, mode: 'insensitive' } },
    ],
  };
}

export async function belowMinIds(db: Db, storeId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT i.id::text AS id
    FROM inventory.item i
    LEFT JOIN inventory.stock_balance b
      ON b.item_id = i.id AND b.store_id = ${storeId}::uuid
    WHERE i.min_qty > 0 AND COALESCE(b.on_hand, 0) < i.min_qty`;
  return rows.map((r) => r.id);
}

export function belowMinFilter(
  flag: 'true' | 'false' | undefined,
  ids: readonly string[],
): Prisma.ItemWhereInput {
  if (flag === 'true') return { id: { in: [...ids] } };
  if (flag === 'false') return { id: { notIn: [...ids] } };
  return {};
}

export function nextOfFor(db: Db) {
  return async (id: string): Promise<string | null> => {
    const row = await db.item.findUnique({
      where: { id },
      select: { supersededById: true },
    });
    return row?.supersededById ?? null;
  };
}

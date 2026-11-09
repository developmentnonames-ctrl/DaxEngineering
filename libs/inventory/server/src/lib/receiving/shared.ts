import { SPECIAL_ZONE_CODE } from '@dax/inventory-contract';
import type {
  Prisma,
  PrismaService,
  TransactionClient,
} from '@dax/platform-db';
import { binParts } from '../bin-codes';
import { decodeCursor, invalid, MODULE_KEY } from '../common';
import { type DecimalLike, isWhole } from '../stock-math';

export type Db = PrismaService | TransactionClient;

export const GRN_KEY = 'inventory.grn';
export const DISCREPANCY_KEY = 'inventory.discrepancy';
export const GRN_DOC_TYPE = 'GRN';

export const ITEM_REF_SELECT = {
  id: true,
  partNo: true,
  description: true,
  uom: true,
  brand: { select: { name: true } },
} as const;

type ItemRefRow = Prisma.ItemGetPayload<{ select: typeof ITEM_REF_SELECT }>;

export function toItemRef(row: ItemRefRow) {
  return {
    id: row.id,
    partNo: row.partNo,
    brand: row.brand.name,
    description: row.description,
    uom: row.uom,
  };
}

export function dayToDate(
  day: string | null | undefined,
): Date | null | undefined {
  if (day === undefined) return undefined;
  return day === null ? null : new Date(`${day}T00:00:00.000Z`);
}

export function dateToDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export async function userNames(
  db: Db,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const rows = await db.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

export function stampOf(
  by: string | null,
  at: Date | null,
  names: ReadonlyMap<string, string>,
): { by: string | null; at: string } | null {
  if (!at) return null;
  return { by: by ? (names.get(by) ?? null) : null, at: at.toISOString() };
}

export function timeCursor(
  cursor: string | undefined,
): { at: Date; id: string } | null {
  if (!cursor) return null;
  const { key, id } = decodeCursor(cursor);
  const at = new Date(key);
  if (Number.isNaN(at.getTime())) invalid('Bad cursor.', ['cursor']);
  return { at, id };
}

export function createdBefore(cursor: string | undefined) {
  const point = timeCursor(cursor);
  if (!point) return {};
  return {
    OR: [
      { createdAt: { lt: point.at } },
      { createdAt: point.at, id: { lt: point.id } },
    ],
  };
}

export interface ItemCheck {
  id: string;
  partNo: string;
  allowFraction: boolean;
  status: string;
}

export async function loadItems(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, ItemCheck>> {
  const rows = await db.item.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, partNo: true, allowFraction: true, status: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

export function checkQty(
  item: ItemCheck,
  qty: DecimalLike,
  field: string,
): void {
  if (!item.allowFraction && !isWhole(qty)) {
    invalid(`${item.partNo} is counted in whole units.`, [field]);
  }
}

export function requireItem(
  items: ReadonlyMap<string, ItemCheck>,
  itemId: string,
  field: string,
  mustBeActive: boolean,
): ItemCheck {
  const item = items.get(itemId);
  if (!item) invalid('Unknown item.', [field]);
  if (mustBeActive && item.status !== 'ACTIVE') {
    invalid(`${item.partNo} is archived and can't be received.`, [field]);
  }
  return item;
}

export async function activeSupplier(db: Db, supplierId: string) {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, active: true, isForeign: true },
  });
  if (!supplier?.active) invalid('Choose an active supplier.', ['supplierId']);
  return supplier;
}

const RECEIVING_CODE = binParts(SPECIAL_ZONE_CODE, 0, 0, 'RCV').code;
const QUARANTINE_CODE = binParts(SPECIAL_ZONE_CODE, 0, 0, 'QUA').code;

export async function specialBins(
  db: Db,
  storeId: string,
): Promise<{ receiving: string; quarantine: string }> {
  const rows = await db.bin.findMany({
    where: { storeId, code: { in: [RECEIVING_CODE, QUARANTINE_CODE] } },
    select: { id: true, code: true },
  });
  const receiving = rows.find((r) => r.code === RECEIVING_CODE);
  const quarantine = rows.find((r) => r.code === QUARANTINE_CODE);
  if (!receiving || !quarantine) {
    throw new Error('The receiving and quarantine bins are missing.');
  }
  return { receiving: receiving.id, quarantine: quarantine.id };
}

export function auditEntry(
  entityKey: string,
  entityId: string,
  action: string,
  after: Record<string, unknown> | null,
  extra: { before?: Record<string, unknown> | null; reason?: string } = {},
) {
  return {
    moduleKey: MODULE_KEY,
    entityKey,
    entityId,
    action,
    before: extra.before ?? null,
    after,
    reason: extra.reason ?? null,
  };
}

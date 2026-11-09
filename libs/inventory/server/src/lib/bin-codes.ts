import { binCode, type BinBulkInput } from '@dax/inventory-contract';

export const BULK_BIN_LIMIT = 500;

export interface BinParts {
  rack: string;
  shelf: string;
  position: string;
  code: string;
}

function numberPart(value: string | number): string {
  return String(Number.parseInt(String(value), 10)).padStart(2, '0');
}

export function binParts(
  zoneCode: string,
  rack: string | number,
  shelf: string | number,
  position: string,
): BinParts {
  const parts = {
    zone: zoneCode.toUpperCase(),
    rack: numberPart(rack),
    shelf: numberPart(shelf),
    position: position.toUpperCase(),
  };
  return {
    rack: parts.rack,
    shelf: parts.shelf,
    position: parts.position,
    code: binCode(parts),
  };
}

export function bulkBinParts(
  zoneCode: string,
  input: Pick<BinBulkInput, 'racks' | 'shelves' | 'positions'>,
): BinParts[] {
  const positions = [...new Set(input.positions.map((p) => p.toUpperCase()))];
  const count =
    (input.racks.to - input.racks.from + 1) *
    (input.shelves.to - input.shelves.from + 1) *
    positions.length;
  if (count > BULK_BIN_LIMIT || count <= 0) {
    throw new RangeError(`Bulk bins must be between 1 and ${BULK_BIN_LIMIT}`);
  }
  const out: BinParts[] = [];
  for (let rack = input.racks.from; rack <= input.racks.to; rack++) {
    for (let shelf = input.shelves.from; shelf <= input.shelves.to; shelf++) {
      for (const position of positions) {
        out.push(binParts(zoneCode, rack, shelf, position));
      }
    }
  }
  return out;
}

export function splitExisting(
  parts: BinParts[],
  existing: ReadonlySet<string>,
): { create: BinParts[]; skipped: string[] } {
  const create: BinParts[] = [];
  const skipped: string[] = [];
  for (const p of parts) {
    if (existing.has(p.code)) skipped.push(p.code);
    else create.push(p);
  }
  return { create, skipped };
}

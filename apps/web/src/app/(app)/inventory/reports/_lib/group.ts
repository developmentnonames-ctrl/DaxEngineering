import type { BinStockBin } from '@dax/inventory-contract';

export interface ZoneGroup {
  zone: BinStockBin['zone'];
  bins: BinStockBin[];
  lineCount: number;
}

export function groupByZone(bins: readonly BinStockBin[]): ZoneGroup[] {
  const groups: ZoneGroup[] = [];
  for (const bin of bins) {
    let group = groups.find((g) => g.zone.id === bin.zone.id);
    if (!group) {
      group = { zone: bin.zone, bins: [], lineCount: 0 };
      groups.push(group);
    }
    group.bins.push(bin);
    group.lineCount += bin.lines.length;
  }
  return groups;
}

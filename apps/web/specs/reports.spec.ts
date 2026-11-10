import type { BinStockBin } from '@dax/inventory-contract';
import { groupByZone } from '../src/app/(app)/inventory/reports/_lib/group';
import { exportHref } from '../src/app/(app)/inventory/reports/_lib/reports';

const ITEM = {
  id: '0190a000-0000-7000-8000-000000000001',
  partNo: 'P-1',
  brand: 'Brand',
  description: 'Part',
  uom: 'PCS',
};

function bin(id: string, zone: string): BinStockBin {
  return {
    id,
    code: `${zone}-01-01-${id.slice(-1)}`,
    kind: 'STORAGE',
    zone: { id: `zone-${zone}`, code: zone, name: `Zone ${zone}` },
    beingCounted: false,
    lines: [{ item: ITEM, qty: '1' }],
  };
}

describe('stock by bin grouping', () => {
  it('keeps zone order and counts lines per zone', () => {
    const groups = groupByZone([
      bin('b1', 'A'),
      bin('b2', 'A'),
      bin('b3', 'B'),
    ]);
    expect(
      groups.map((g) => [g.zone.code, g.bins.length, g.lineCount]),
    ).toEqual([
      ['A', 2, 2],
      ['B', 1, 1],
    ]);
  });
});

describe('report export links', () => {
  it('drops paging but keeps filters', () => {
    expect(
      exportHref('movements', {
        from: '2026-04-01',
        cursor: 'abc',
        limit: '50',
        movement: 'ISSUE',
      }),
    ).toBe('/api/reports/movements?from=2026-04-01&movement=ISSUE');
    expect(exportHref('below-minimum')).toBe('/api/reports/below-minimum');
  });
});

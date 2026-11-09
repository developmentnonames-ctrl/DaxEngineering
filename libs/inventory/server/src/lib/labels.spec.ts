import { LABELS_PER_SHEET } from '@dax/inventory-contract';
import {
  LABEL_SHEET,
  type LabelContent,
  labelSlots,
  perSheet,
  renderLabels,
  withCopies,
} from './labels';

const item: LabelContent = {
  kind: 'item',
  url: 'https://stores.example.com/q/i/AbC123xyZ789',
  partNo: '1R-0750',
  brand: 'Caterpillar',
  description:
    'Fuel filter element, high efficiency, for engines with a very long description',
  uom: 'PCS',
};
const bin: LabelContent = {
  kind: 'bin',
  url: 'https://stores.example.com/q/b/ZyX987cbA321',
  code: 'X-00-00-RCV',
  zone: 'Special areas',
  binKind: 'RECEIVING',
};

function pageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
}

describe('label layout', () => {
  it('matches the 3 x 8 sheet', () => {
    expect(perSheet()).toBe(LABELS_PER_SHEET);
  });

  it('places labels left to right, top to bottom', () => {
    const slots = labelSlots(4, 0);
    expect(slots.map((s) => [s.row, s.column])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ]);
    expect(slots[0]).toMatchObject({ xMm: 0, yMm: LABEL_SHEET.marginTopMm });
    expect(slots[2]?.xMm).toBe(140);
    expect(slots[3]?.yMm).toBeCloseTo(LABEL_SHEET.marginTopMm + 37);
  });

  it('skips used cells on the first sheet', () => {
    const slots = labelSlots(2, 5);
    expect(slots[0]).toMatchObject({ page: 0, row: 1, column: 2 });
    expect(slots[1]).toMatchObject({ page: 0, row: 2, column: 0 });
  });

  it('flows onto more pages', () => {
    const slots = labelSlots(30, 23);
    expect(slots[0]).toMatchObject({ page: 0, row: 7, column: 2 });
    expect(slots[1]).toMatchObject({ page: 1, row: 0, column: 0 });
    expect(slots.at(-1)).toMatchObject({ page: 2, row: 1, column: 1 });
  });

  it('repeats each label for copies', () => {
    expect(withCopies(['a', 'b'], 3)).toEqual(['a', 'a', 'a', 'b', 'b', 'b']);
  });
});

describe('label PDF', () => {
  it('renders a PDF with one page per sheet', async () => {
    const pdf = await renderLabels(withCopies([item, bin], 13), 0);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(pageCount(pdf)).toBe(2);
  });

  it('starts a new page when skipped cells push past the first sheet', async () => {
    const pdf = await renderLabels([item, item], 23);
    expect(pageCount(pdf)).toBe(2);
  });
});

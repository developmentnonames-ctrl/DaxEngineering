import { describe, expect, it } from 'vitest';
import {
  cardTone,
  lineHints,
  summarize,
} from '../src/app/(app)/inventory/receiving/_lib/lines';

const line = (over: Partial<Parameters<typeof lineHints>[0]> = {}) => ({
  qtyExpected: '10',
  qtyGood: '10',
  qtyDamaged: '0',
  wrongItem: false,
  ...over,
});

describe('receiving line hints', () => {
  it('confirms a line that matches', () => {
    const hints = lineHints(line());
    expect(hints.map((h) => h.tone)).toEqual(['ok']);
    expect(cardTone(hints)).toBe('ok');
  });

  it('flags short, extra and damaged quantities', () => {
    expect(lineHints(line({ qtyGood: '7' }))[0]?.label).toBe('Short 3');
    expect(lineHints(line({ qtyGood: '12' }))[0]?.label).toMatch(/^Extra 2/);
    const damaged = lineHints(line({ qtyGood: '8', qtyDamaged: '2' }));
    expect(damaged.map((h) => h.label)).toEqual(['2 damaged · to quarantine']);
    expect(cardTone(damaged)).toBe('bad');
  });

  it('gives no short or extra hint without a delivery note quantity', () => {
    expect(lineHints(line({ qtyExpected: null, qtyGood: '3' }))).toEqual([]);
    expect(lineHints(line({ qtyExpected: '', qtyGood: '3' }))).toEqual([]);
  });

  it('summarizes what posting will do', () => {
    expect(
      summarize([
        line(),
        line({ qtyGood: '0', qtyDamaged: '10' }),
        line({ wrongItem: true }),
      ]),
    ).toEqual({ goodLines: 2, damagedLines: 1, flagged: 2 });
  });
});

import {
  BinStockQuery,
  MovementReportQuery,
  SlowMovingQuery,
} from '@dax/inventory-contract';
import {
  colomboDateTime,
  colomboDay,
  colomboRange,
  csvCell,
  daysSince,
  freeOf,
  shortBy,
  slowMovingCutoff,
  toCsv,
} from './report-math';

describe('Colombo calendar days', () => {
  it('turns an inclusive day range into UTC bounds', () => {
    const range = colomboRange('2026-04-01', '2026-04-30');
    expect(range?.gte?.toISOString()).toBe('2026-03-31T18:30:00.000Z');
    expect(range?.lt?.toISOString()).toBe('2026-04-30T18:30:00.000Z');
  });

  it('leaves open ends open', () => {
    expect(colomboRange(undefined, undefined)).toBeUndefined();
    expect(colomboRange('2026-01-05', undefined)).toEqual({
      gte: new Date('2026-01-04T18:30:00.000Z'),
    });
    expect(colomboRange(undefined, '2026-01-05')).toEqual({
      lt: new Date('2026-01-05T18:30:00.000Z'),
    });
  });

  it('reads UTC instants as Colombo dates and times', () => {
    const lateUtc = new Date('2026-11-09T19:00:00.000Z');
    expect(colomboDay(lateUtc)).toBe('2026-11-10');
    expect(colomboDateTime(lateUtc)).toBe('2026-11-10 00:30');
    expect(colomboDay(new Date('2026-11-09T18:29:59.999Z'))).toBe('2026-11-09');
  });

  it('counts calendar days in Colombo, not 24-hour periods', () => {
    const now = new Date('2026-11-10T04:00:00.000Z');
    expect(daysSince(new Date('2026-11-09T18:31:00.000Z'), now)).toBe(0);
    expect(daysSince(new Date('2026-11-09T18:29:00.000Z'), now)).toBe(1);
    expect(daysSince(new Date('2026-08-12T04:00:00.000Z'), now)).toBe(90);
  });

  it('puts the slow-moving cutoff so that every match is at least N days old', () => {
    const now = new Date('2026-11-10T04:00:00.000Z');
    const cutoff = slowMovingCutoff(90, now);
    expect(cutoff.toISOString()).toBe('2026-08-12T18:30:00.000Z');
    const justBefore = new Date(cutoff.getTime() - 1);
    expect(daysSince(justBefore, now)).toBe(90);
    expect(daysSince(cutoff, now)).toBe(89);
  });
});

describe('below-minimum maths', () => {
  it('takes held, quarantine and receiving out of free stock', () => {
    expect(
      freeOf({
        onHand: '10',
        held: '2',
        quarantine: '1',
        receiving: '3',
      }).toFixed(),
    ).toBe('4');
  });

  it('is short by the gap to the minimum, never below zero', () => {
    expect(shortBy('10', '4').toFixed()).toBe('6');
    expect(shortBy('10', '-2').toFixed()).toBe('12');
    expect(shortBy('5', '7').toFixed()).toBe('0');
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('Bolt, M8')).toBe('"Bolt, M8"');
    expect(csvCell('6" pipe')).toBe('"6"" pipe"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('defuses spreadsheet formulas but keeps negative numbers', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('+94 77')).toBe("'+94 77");
    expect(csvCell('-5')).toBe('-5');
    expect(csvCell('-2.500')).toBe('-2.500');
  });

  it('writes a BOM, a header and CRLF rows', () => {
    const text = toCsv(['A', 'B'], [['1', 'x,y']]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1)).toBe('A,B\r\n1,"x,y"\r\n');
  });
});

describe('report queries', () => {
  it('rejects a start date after the end date', () => {
    expect(
      MovementReportQuery.safeParse({ from: '2026-05-02', to: '2026-05-01' })
        .success,
    ).toBe(false);
    expect(
      MovementReportQuery.parse({ from: '2026-05-01', to: '2026-05-01' }),
    ).toMatchObject({ page: 1, limit: 25 });
  });

  it('defaults slow-moving to 90 days and only allows the set choices', () => {
    expect(SlowMovingQuery.parse({}).days).toBe('90');
    expect(SlowMovingQuery.safeParse({ days: '45' }).success).toBe(false);
  });

  it('accepts a zone and a bin kind for stock by bin', () => {
    expect(BinStockQuery.safeParse({ kind: 'STORAGE' }).success).toBe(true);
    expect(BinStockQuery.safeParse({ kind: 'SHELF' }).success).toBe(false);
  });
});

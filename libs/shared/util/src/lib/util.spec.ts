import { describe, expect, it } from 'vitest';
import { formatDocNumber } from './doc-number';
import { fiscalYearOf } from './fiscal-year';

describe('fiscalYearOf', () => {
  it('uses the April start in Colombo time', () => {
    // 2026-03-31 23:59:59 in Colombo (UTC+5:30)
    expect(fiscalYearOf(new Date('2026-03-31T18:29:59Z')).label).toBe('25');
    // 2026-04-01 00:00:00 in Colombo, still 31 March in UTC
    expect(fiscalYearOf(new Date('2026-03-31T18:30:00Z'))).toEqual({
      startYear: 2026,
      label: '26',
      periodKey: 'FY2026',
    });
    expect(fiscalYearOf(new Date('2027-03-31T12:00:00Z')).label).toBe('26');
    expect(fiscalYearOf(new Date('2026-11-09T12:00:00Z')).label).toBe('26');
  });

  it('supports other start months', () => {
    expect(
      fiscalYearOf(new Date('2026-02-01T12:00:00Z'), { startMonth: 1 }).label,
    ).toBe('26');
    expect(() => fiscalYearOf(new Date(), { startMonth: 13 })).toThrow(
      RangeError,
    );
  });
});

describe('formatDocNumber', () => {
  it('formats with a subtype', () => {
    expect(formatDocNumber({ doc: 'GRN', sub: 'FOR', fy: '26', seq: 1 })).toBe(
      'GRN/FOR/26/0001',
    );
    expect(
      formatDocNumber({ doc: 'AOD', sub: 'SER', fy: '26', seq: 136 }),
    ).toBe('AOD/SER/26/0136');
  });

  it('drops the subtype segment when there is none', () => {
    expect(formatDocNumber({ doc: 'RTN', fy: '26', seq: 7 })).toBe(
      'RTN/26/0007',
    );
  });

  it('honours padding and custom patterns', () => {
    expect(
      formatDocNumber({ doc: 'CNT', fy: '26', seq: 5 }, '{DOC}-{FY}-{SEQ}', 3),
    ).toBe('CNT-26-005');
    expect(
      formatDocNumber({ doc: 'GRN', sub: 'LOC', fy: '26', seq: 12345 }),
    ).toBe('GRN/LOC/26/12345');
  });

  it('rejects bad sequences', () => {
    expect(() => formatDocNumber({ doc: 'GRN', fy: '26', seq: 0 })).toThrow(
      RangeError,
    );
  });
});

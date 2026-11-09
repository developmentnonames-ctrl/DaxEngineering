import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TransactionClient } from '@dax/platform-db';
import { NumberingService, type SeriesFormat } from './numbering.service';

interface FakeSeries extends SeriesFormat {
  id: string;
  active: boolean;
  removedAt: Date | null;
}

const grnFor: FakeSeries = {
  id: '0190a0b0-0000-7000-8000-000000000001',
  docType: 'GRN',
  subtype: 'FOR',
  pattern: '{DOC}/{SUB}/{FY}/{SEQ}',
  padding: 4,
  active: true,
  removedAt: null,
};
const hold: FakeSeries = {
  ...grnFor,
  id: '0190a0b0-0000-7000-8000-000000000002',
  docType: 'HLD',
  subtype: '',
  padding: 5,
};

function fakeTx(series: FakeSeries[]) {
  const counters = new Map<string, number>();
  const queries: { sql: string; values: unknown[] }[] = [];
  const tx = {
    numberSeries: {
      findUnique: async (args: {
        where: { docType_subtype: { docType: string; subtype: string } };
      }) => {
        const { docType, subtype } = args.where.docType_subtype;
        return (
          series.find((s) => s.docType === docType && s.subtype === subtype) ??
          null
        );
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: strings.join('?'), values });
      const key = `${values[0]}|${values[1]}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return [{ last_value: next }];
    },
  };
  return { tx: tx as unknown as TransactionClient, queries };
}

describe('NumberingService', () => {
  const service = new NumberingService();
  const may = new Date('2026-05-10T06:00:00Z');

  it('formats with a subtype and increments per period', async () => {
    const { tx, queries } = fakeTx([grnFor]);
    const first = await service.next(tx, {
      docType: 'GRN',
      subtype: 'FOR',
      date: may,
    });
    const second = await service.next(tx, {
      docType: 'GRN',
      subtype: 'FOR',
      date: may,
    });
    expect(first).toEqual({
      number: 'GRN/FOR/26/0001',
      seq: 1,
      periodKey: 'FY2026',
    });
    expect(second.number).toBe('GRN/FOR/26/0002');
    expect(queries[0].sql).toContain('ON CONFLICT (series_id, period_key)');
    expect(queries[0].sql).toContain('RETURNING last_value');
    expect(queries[0].values).toEqual([grnFor.id, 'FY2026']);
  });

  it('drops the subtype segment when the series has none', async () => {
    const { tx } = fakeTx([hold]);
    const result = await service.next(tx, { docType: 'HLD', date: may });
    expect(result.number).toBe('HLD/26/00001');
  });

  it('switches financial year at midnight 1 April in Colombo', async () => {
    const { tx } = fakeTx([grnFor]);
    const beforeMidnight = new Date('2026-03-31T18:29:59Z');
    const atMidnight = new Date('2026-03-31T18:30:00Z');
    const march = await service.next(tx, {
      docType: 'GRN',
      subtype: 'FOR',
      date: beforeMidnight,
    });
    const april = await service.next(tx, {
      docType: 'GRN',
      subtype: 'FOR',
      date: atMidnight,
    });
    expect(march).toEqual({
      number: 'GRN/FOR/25/0001',
      seq: 1,
      periodKey: 'FY2025',
    });
    expect(april).toEqual({
      number: 'GRN/FOR/26/0001',
      seq: 1,
      periodKey: 'FY2026',
    });
  });

  it.each([
    ['unknown', [] as FakeSeries[]],
    ['inactive', [{ ...grnFor, active: false }]],
    ['removed', [{ ...grnFor, removedAt: new Date() }]],
  ])('refuses an %s series without touching the counter', async (_, series) => {
    const { tx, queries } = fakeTx(series);
    const result = service.next(tx, {
      docType: 'GRN',
      subtype: 'FOR',
      date: may,
    });
    await expect(result).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(result).rejects.toMatchObject({
      response: {
        code: 'NUMBER_SERIES_UNAVAILABLE',
        message: 'There is no active number series for GRN/FOR.',
      },
    });
    expect(queries).toHaveLength(0);
  });

  it('previews an example number without a database', () => {
    expect(service.preview(grnFor, may)).toEqual({
      number: 'GRN/FOR/26/0001',
      seq: 1,
      periodKey: 'FY2026',
    });
    expect(
      service.preview({ ...hold, pattern: '{DOC}-{FY}-{SEQ}', padding: 3 }, may)
        .number,
    ).toBe('HLD-26-001');
  });
});

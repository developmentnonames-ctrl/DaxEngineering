import type { HttpException } from '@nestjs/common';
import { Prisma } from '@dax/platform-db';
import {
  assertReturnableAod,
  assertReturnAction,
  binFor,
  checkFault,
  checkFreeReason,
  isReturnableAod,
  movesStock,
  overReturned,
  overReturnFor,
  returnableQty,
  sumByAodLine,
} from './rules';

function refused(run: () => void): HttpException | null {
  try {
    run();
    return null;
  } catch (error) {
    return error as HttpException;
  }
}

const body = (error: HttpException | null) =>
  error?.getResponse() as {
    code?: string;
    message?: string;
    fields?: string[];
  };

const D = (v: string | number) => new Prisma.Decimal(v);

describe('returnable quantity', () => {
  it('is what was issued less what has come back', () => {
    expect(returnableQty('5', '2').toFixed()).toBe('3');
    expect(returnableQty('2.5', '0').toFixed()).toBe('2.5');
  });

  it('never goes below zero', () => {
    expect(returnableQty('2', '3').toFixed()).toBe('0');
  });

  it('adds up split lines per AOD line and ignores free lines', () => {
    const totals = sumByAodLine([
      { aodLineId: 'a', qty: '1' },
      { aodLineId: 'a', qty: '1.5' },
      { aodLineId: 'b', qty: '2' },
      { aodLineId: null, qty: '9' },
    ]);
    expect(totals.get('a')?.toFixed()).toBe('2.5');
    expect(totals.get('b')?.toFixed()).toBe('2');
    expect(totals.size).toBe(2);
  });

  it('finds the AOD line returned beyond what is left', () => {
    const left = new Map([
      ['a', D(3)],
      ['b', D(1)],
    ]);
    expect(
      overReturned(
        [
          { aodLineId: 'a', qty: '2' },
          { aodLineId: 'a', qty: '1' },
        ],
        left,
      ),
    ).toBeNull();
    expect(
      overReturned(
        [
          { aodLineId: 'a', qty: '1' },
          { aodLineId: 'b', qty: '1.5' },
        ],
        left,
      ),
    ).toBe('b');
    expect(overReturned([{ aodLineId: 'c', qty: '1' }], left)).toBe('c');
  });

  it('names the part and what is left when refusing', () => {
    expect(body(refused(() => overReturnFor('P-1', D(2))))).toMatchObject({
      code: 'OVER_RETURN',
      message: 'Only 2 of P-1 can still be returned from this AOD.',
    });
    expect(body(refused(() => overReturnFor('P-1', D(0))))?.message).toBe(
      'Everything of P-1 on this AOD has already been returned.',
    );
  });
});

describe('condition and bin', () => {
  const QUA = 'quarantine-bin';

  it('puts good parts in the bin the keeper chose', () => {
    expect(binFor('GOOD', 'shelf', QUA, 'lines.0.binId')).toBe('shelf');
  });

  it('needs a bin for good parts', () => {
    expect(
      body(refused(() => binFor('GOOD', null, QUA, 'lines.0.binId'))),
    ).toMatchObject({ code: 'INVALID_INPUT', fields: ['lines.0.binId'] });
  });

  it('always sends damaged parts to quarantine', () => {
    expect(binFor('DAMAGED', 'shelf', QUA, 'f')).toBe(QUA);
    expect(binFor('DAMAGED', null, QUA, 'f')).toBe(QUA);
  });

  it('gives faulty parts no bin and no stock movement', () => {
    expect(binFor('FAULTY', 'shelf', QUA, 'f')).toBeNull();
    expect(movesStock('FAULTY')).toBe(false);
    expect(movesStock('GOOD')).toBe(true);
    expect(movesStock('DAMAGED')).toBe(true);
  });

  it('needs a fault description for faulty parts only', () => {
    expect(refused(() => checkFault('FAULTY', '  ', 'n'))).not.toBeNull();
    expect(refused(() => checkFault('FAULTY', 'No output', 'n'))).toBeNull();
    expect(refused(() => checkFault('GOOD', null, 'n'))).toBeNull();
  });
});

describe('return flow', () => {
  it('needs a reason of five characters for a free return', () => {
    expect(body(refused(() => checkFreeReason('spar')))?.fields).toEqual([
      'reason',
    ]);
    expect(refused(() => checkFreeReason(null))).not.toBeNull();
    expect(refused(() => checkFreeReason('Spare left over'))).toBeNull();
  });

  it('changes only drafts', () => {
    expect(refused(() => assertReturnAction('post', 'DRAFT'))).toBeNull();
    for (const status of ['POSTED', 'CANCELLED'] as const) {
      for (const action of ['edit', 'post', 'cancel'] as const) {
        expect(
          body(refused(() => assertReturnAction(action, status)))?.code,
        ).toBe('INVALID_STATE');
      }
    }
  });

  it('takes returns only against issued or signed AODs', () => {
    expect(isReturnableAod('ISSUED')).toBe(true);
    expect(isReturnableAod('SIGNED')).toBe(true);
    expect(isReturnableAod('PICKING')).toBe(false);
    expect(refused(() => assertReturnableAod('CANCELLED'))).not.toBeNull();
  });
});

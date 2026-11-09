import { ConflictException, type HttpException } from '@nestjs/common';
import { Prisma } from '@dax/platform-db';
import {
  assertGrnAction,
  type GrnAction,
  type GrnStatus,
  hasSomethingReceived,
  isFullyPutAway,
  lineDiscrepancies,
  putawayOverLimit,
  toPutAway,
} from './rules';

function refusal(action: GrnAction, status: GrnStatus): HttpException | null {
  try {
    assertGrnAction(action, status);
    return null;
  } catch (error) {
    return error as HttpException;
  }
}

describe('GRN state machine', () => {
  const allowed: [GrnAction, GrnStatus[]][] = [
    ['edit', ['DRAFT', 'CHECKED']],
    ['check', ['DRAFT']],
    ['post', ['CHECKED']],
    ['cancel', ['DRAFT', 'CHECKED']],
    ['reverse', ['POSTED', 'PUT_AWAY']],
    ['putaway', ['POSTED']],
  ];
  const statuses: GrnStatus[] = [
    'DRAFT',
    'CHECKED',
    'POSTED',
    'PUT_AWAY',
    'CANCELLED',
    'REVERSED',
  ];

  it.each(allowed)('allows %s only from %j', (action, from) => {
    for (const status of statuses) {
      const error = refusal(action, status);
      if (from.includes(status)) {
        expect(error).toBeNull();
      } else {
        expect(error).toBeInstanceOf(ConflictException);
        expect(error?.getResponse()).toMatchObject({ code: 'INVALID_STATE' });
      }
    }
  });

  it('explains why a draft cannot be posted', () => {
    expect(refusal('post', 'DRAFT')?.getResponse()).toMatchObject({
      message: 'Check the GRN before posting it.',
    });
  });
});

describe('discrepancies from a received line', () => {
  const line = (
    qtyExpected: string | null,
    qtyGood: string,
    qtyDamaged = '0',
    wrongItem = false,
  ) => ({ qtyExpected, qtyGood, qtyDamaged, wrongItem });

  it('records nothing when the delivery matches', () => {
    expect(lineDiscrepancies(line('10', '10'))).toEqual([]);
  });

  it('records a shortage with decimals', () => {
    expect(lineDiscrepancies(line('12.5', '10.25', '1.125'))).toEqual([
      { kind: 'SHORT', qty: '1.125' },
      { kind: 'DAMAGED', qty: '1.125' },
    ]);
  });

  it('counts damaged goods as delivered when working out excess', () => {
    expect(lineDiscrepancies(line('0.3', '0.2', '0.2'))).toEqual([
      { kind: 'EXCESS', qty: '0.1' },
      { kind: 'DAMAGED', qty: '0.2' },
    ]);
  });

  it('skips shortage and excess without a delivery-note quantity', () => {
    expect(lineDiscrepancies(line(null, '5', '2'))).toEqual([
      { kind: 'DAMAGED', qty: '2' },
    ]);
  });

  it('flags a wrong item instead of a shortage', () => {
    expect(lineDiscrepancies(line('10', '4', '0', true))).toEqual([
      { kind: 'WRONG_ITEM', qty: '4' },
    ]);
  });

  it('counts a refused wrong item by the delivery-note quantity, else one', () => {
    expect(lineDiscrepancies(line('3', '0', '0', true))).toEqual([
      { kind: 'WRONG_ITEM', qty: '3' },
    ]);
    expect(lineDiscrepancies(line(null, '0', '0', true))).toEqual([
      { kind: 'WRONG_ITEM', qty: '1' },
    ]);
  });

  it('needs a received quantity or a wrong item before checking', () => {
    expect(hasSomethingReceived([line('5', '0')])).toBe(false);
    expect(hasSomethingReceived([line('5', '0', '0.001')])).toBe(true);
    expect(hasSomethingReceived([line('5', '0', '0', true)])).toBe(true);
  });
});

describe('put-away limits', () => {
  const remaining = new Map([
    ['a', new Prisma.Decimal('2.5')],
    ['b', new Prisma.Decimal('1')],
  ]);

  it('accepts moves within what is left, split across bins', () => {
    expect(
      putawayOverLimit(
        [
          { grnLineId: 'a', qty: '1.25' },
          { grnLineId: 'a', qty: '1.25' },
          { grnLineId: 'b', qty: '1' },
        ],
        remaining,
      ),
    ).toBeNull();
  });

  it('names the line whose moves add up to more than is left', () => {
    expect(
      putawayOverLimit(
        [
          { grnLineId: 'a', qty: '2' },
          { grnLineId: 'a', qty: '0.501' },
        ],
        remaining,
      ),
    ).toBe('a');
    expect(putawayOverLimit([{ grnLineId: 'x', qty: '1' }], remaining)).toBe(
      'x',
    );
  });

  it('knows when a GRN is fully put away', () => {
    expect(toPutAway('3', '1').toFixed()).toBe('2');
    expect(
      isFullyPutAway([
        { qtyGood: '3', qtyPutAway: '3' },
        { qtyGood: '0', qtyPutAway: '0' },
      ]),
    ).toBe(true);
    expect(isFullyPutAway([{ qtyGood: '3', qtyPutAway: '2.999' }])).toBe(false);
  });
});

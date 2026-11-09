import { ConflictException, type HttpException } from '@nestjs/common';
import { Prisma } from '@dax/platform-db';
import {
  type AodAction,
  type AodStatus,
  aodTypeLabel,
  assertAodAction,
  assertHoldActive,
  assertMrnAction,
  canClose,
  type MrnAction,
  type MrnStatus,
  outstandingQty,
  overReserved,
  statusAfterIssue,
  suggestBin,
  toReserve,
  waitingQty,
} from './rules';

function refused(run: () => void): HttpException | null {
  try {
    run();
    return null;
  } catch (error) {
    return error as HttpException;
  }
}

const MRN_STATUSES: MrnStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'CHECKED',
  'READY',
  'PARTLY_ISSUED',
  'ISSUED',
  'CLOSED',
  'SHORT_CLOSED',
  'CANCELLED',
];
const AOD_STATUSES: AodStatus[] = ['PICKING', 'ISSUED', 'SIGNED', 'CANCELLED'];

describe('MRN state machine', () => {
  const allowed: [MrnAction, MrnStatus[]][] = [
    ['edit', ['DRAFT']],
    ['submit', ['DRAFT']],
    ['check', ['SUBMITTED']],
    ['allocate', ['CHECKED', 'READY', 'PARTLY_ISSUED']],
    ['cancel', ['DRAFT', 'SUBMITTED', 'CHECKED', 'READY']],
    ['short_close', ['CHECKED', 'READY', 'PARTLY_ISSUED']],
    ['pick', ['CHECKED', 'READY', 'PARTLY_ISSUED']],
  ];

  it.each(allowed)('allows %s only from %j', (action, from) => {
    for (const status of MRN_STATUSES) {
      const error = refused(() => assertMrnAction(action, status));
      if (from.includes(status)) expect(error).toBeNull();
      else {
        expect(error).toBeInstanceOf(ConflictException);
        expect(error?.getResponse()).toMatchObject({ code: 'INVALID_STATE' });
      }
    }
  });
});

describe('AOD state machine', () => {
  const allowed: [AodAction, AodStatus[]][] = [
    ['edit', ['PICKING']],
    ['issue', ['PICKING']],
    ['cancel', ['PICKING']],
    ['sign', ['ISSUED']],
  ];

  it.each(allowed)('allows %s only from %j', (action, from) => {
    for (const status of AOD_STATUSES) {
      const error = refused(() => assertAodAction(action, status));
      expect(error === null).toBe(from.includes(status));
    }
  });

  it('only acts on active holds', () => {
    expect(refused(() => assertHoldActive('ACTIVE'))).toBeNull();
    expect(
      refused(() => assertHoldActive('CONVERTED'))?.getResponse(),
    ).toMatchObject({ code: 'INVALID_STATE' });
    expect(refused(() => assertHoldActive('RELEASED'))).not.toBeNull();
  });
});

describe('request quantities', () => {
  const line = (
    qtyRequested: string,
    qtyIssued = '0',
    qtyShortClosed = '0',
  ) => ({ qtyRequested, qtyIssued, qtyShortClosed });

  it('works out what is still outstanding and waiting with decimals', () => {
    expect(outstandingQty(line('10.5', '2.25', '1')).toFixed()).toBe('7.25');
    expect(waitingQty(line('10.5', '2.25'), '3.125').toFixed()).toBe('5.125');
    expect(waitingQty(line('4', '1'), '5').toFixed()).toBe('0');
  });

  it('reserves what is free and leaves the rest waiting', () => {
    expect(toReserve(line('10'), '2', '3').toFixed()).toBe('3');
    expect(toReserve(line('10'), '2', '30').toFixed()).toBe('8');
    expect(toReserve(line('10'), '0', '-1').toFixed()).toBe('0');
    expect(toReserve(line('10', '10'), '0', '5').toFixed()).toBe('0');
  });

  it('is issued once every line is issued or closed short', () => {
    expect(statusAfterIssue([line('5', '5'), line('2', '1', '1')])).toBe(
      'ISSUED',
    );
    expect(statusAfterIssue([line('5', '4.999')])).toBe('PARTLY_ISSUED');
  });

  it('closes only an issued request whose AODs are all signed', () => {
    expect(
      canClose('ISSUED', [{ status: 'SIGNED' }, { status: 'CANCELLED' }]),
    ).toBe(true);
    expect(
      canClose('ISSUED', [{ status: 'SIGNED' }, { status: 'ISSUED' }]),
    ).toBe(false);
    expect(canClose('PARTLY_ISSUED', [{ status: 'SIGNED' }])).toBe(false);
  });
});

describe('picking', () => {
  it('stops an AOD taking more than the line has reserved, across bins', () => {
    const reserved = new Map([['a', new Prisma.Decimal('3')]]);
    expect(
      overReserved(
        [
          { mrnLineId: 'a', qty: '1.5' },
          { mrnLineId: 'a', qty: '1.5' },
        ],
        reserved,
      ),
    ).toBeNull();
    expect(
      overReserved(
        [
          { mrnLineId: 'a', qty: '2' },
          { mrnLineId: 'a', qty: '1.001' },
        ],
        reserved,
      ),
    ).toBe('a');
  });

  it('suggests the default bin when it holds enough, else the fullest bin', () => {
    const options = [
      { binId: 'def', qty: '2' },
      { binId: 'big', qty: '9' },
      { binId: 'mid', qty: '5' },
    ];
    expect(suggestBin('def', options, '2')).toBe('def');
    expect(suggestBin('def', options, '3')).toBe('big');
    expect(suggestBin(null, [], '1')).toBeNull();
  });

  it('labels AOD types from the number series', () => {
    expect(aodTypeLabel('DIR')).toBe('Direct sale');
    expect(aodTypeLabel('XYZ')).toBe('XYZ');
  });
});

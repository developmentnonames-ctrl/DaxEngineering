import type { HttpException } from '@nestjs/common';
import {
  assertCountAction,
  assertNotSelfApproval,
  difference,
  ineligibility,
  ineligibleMessage,
  seesSystemQty,
  tookPart,
  uncounted,
} from './rules';

const ME = 'me';
const OTHER = 'other';

function codeOf(run: () => void): string | undefined {
  try {
    run();
  } catch (error) {
    return ((error as HttpException).getResponse() as { code?: string }).code;
  }
  return undefined;
}

describe('count rules', () => {
  it('works out differences as counted minus system', () => {
    expect(difference('7', '10').toFixed()).toBe('-3');
    expect(difference('12.5', '10').toFixed()).toBe('2.5');
    expect(difference('4', '4').isZero()).toBe(true);
    expect(difference('3', 0).toFixed()).toBe('3');
  });

  it('only counts active storage and quarantine bins', () => {
    const bin = { kind: 'STORAGE' as const, active: true, openedAt: null };
    expect(ineligibility(bin, 'CYCLE')).toBeNull();
    expect(ineligibility({ ...bin, kind: 'QUARANTINE' }, 'FULL')).toBeNull();
    expect(ineligibility({ ...bin, kind: 'RECEIVING' }, 'CYCLE')).toBe('KIND');
    expect(ineligibility({ ...bin, kind: 'WARRANTY' }, 'CYCLE')).toBe('KIND');
    expect(ineligibility({ ...bin, active: false }, 'CYCLE')).toBe('INACTIVE');
  });

  it('allows one opening count per bin', () => {
    const opened = {
      kind: 'STORAGE' as const,
      active: true,
      openedAt: new Date(),
    };
    expect(ineligibility(opened, 'OPENING')).toBe('OPENED');
    expect(ineligibility(opened, 'CYCLE')).toBeNull();
    expect(ineligibleMessage('A-01-01-A', 'OPENED')).toContain('A-01-01-A');
  });

  it('refuses approval by anyone who counted or submitted', () => {
    expect(tookPart(ME, OTHER, [OTHER, null])).toBe(false);
    expect(tookPart(ME, ME, [OTHER])).toBe(true);
    expect(tookPart(ME, OTHER, [OTHER, ME])).toBe(true);
    expect(codeOf(() => assertNotSelfApproval(ME, ME, []))).toBe(
      'SELF_APPROVAL',
    );
    expect(codeOf(() => assertNotSelfApproval(ME, OTHER, [ME]))).toBe(
      'SELF_APPROVAL',
    );
    expect(
      codeOf(() => assertNotSelfApproval(ME, OTHER, [OTHER])),
    ).toBeUndefined();
  });

  it('hides system quantities on an open blind count from counters', () => {
    expect(seesSystemQty(true, 'COUNTING', false)).toBe(false);
    expect(seesSystemQty(true, 'SUBMITTED', false)).toBe(false);
    expect(seesSystemQty(true, 'COUNTING', true)).toBe(true);
    expect(seesSystemQty(false, 'COUNTING', false)).toBe(true);
    expect(seesSystemQty(true, 'POSTED', false)).toBe(true);
  });

  it('moves through the count states', () => {
    expect(
      codeOf(() => assertCountAction('count', 'COUNTING')),
    ).toBeUndefined();
    expect(codeOf(() => assertCountAction('count', 'SUBMITTED'))).toBe(
      'INVALID_STATE',
    );
    expect(codeOf(() => assertCountAction('approve', 'COUNTING'))).toBe(
      'INVALID_STATE',
    );
    expect(
      codeOf(() => assertCountAction('cancel', 'SUBMITTED')),
    ).toBeUndefined();
    expect(codeOf(() => assertCountAction('cancel', 'POSTED'))).toBe(
      'INVALID_STATE',
    );
  });

  it('counts lines still waiting for a quantity', () => {
    expect(
      uncounted([
        { countedQty: '1' },
        { countedQty: null },
        { countedQty: '0' },
      ]),
    ).toBe(1);
  });
});

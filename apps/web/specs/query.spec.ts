import { describe, expect, it } from 'vitest';
import { ItemQuery } from '@dax/inventory-contract';
import { trimQty } from '../src/lib/format';
import { readQuery, toQuery } from '../src/lib/query';

describe('list query helpers', () => {
  it('keeps valid filters and drops broken ones', () => {
    const query = readQuery(ItemQuery, {
      q: 'filter',
      brandId: 'not-a-uuid',
      status: 'ALL',
    });
    expect(query).toMatchObject({
      q: 'filter',
      status: 'ALL',
      page: 1,
      limit: 25,
    });
    expect(query).not.toHaveProperty('brandId');
  });

  it('builds query strings without empty values', () => {
    expect(toQuery({ q: 'a b', page: undefined, active: '' })).toBe('?q=a+b');
    expect(toQuery({})).toBe('');
  });

  it('trims trailing zeros from quantities only after a decimal point', () => {
    expect(trimQty('10')).toBe('10');
    expect(trimQty('5.000')).toBe('5');
    expect(trimQty('2.500')).toBe('2.5');
  });
});

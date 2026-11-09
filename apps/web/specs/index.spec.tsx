import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@dax/web-shell';

describe('safeNextPath', () => {
  it('only allows same-site relative paths after sign-in', () => {
    expect(safeNextPath('/inventory')).toBe('/inventory');
    expect(safeNextPath('//evil.test')).toBe('/');
    expect(safeNextPath('https://evil.test')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });
});

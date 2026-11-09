import { permissionKeys } from '@dax/contracts';
import { describe, expect, it } from 'vitest';
import { inventoryManifest } from './manifest';

describe('inventoryManifest', () => {
  it('declares the phase 1 permissions', () => {
    const keys = permissionKeys(inventoryManifest);
    expect(keys).toContain('inventory.grn.post');
    expect(keys).toContain('inventory.count.approve');
    expect(keys).toContain('inventory.aod.issue');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps approvals away from stores keepers', () => {
    const keeper = inventoryManifest.defaultGrants.stores_keeper;
    expect(keeper).not.toHaveProperty('count.approve');
    expect(keeper).not.toHaveProperty('grn.reverse');
  });

  it('gives stock viewers read-only access', () => {
    const viewer = Object.keys(inventoryManifest.defaultGrants.stock_viewer);
    expect(viewer.every((k) => k.endsWith('.view'))).toBe(true);
  });
});

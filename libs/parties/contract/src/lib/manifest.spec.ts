import { permissionKeys } from '@dax/contracts';
import { describe, expect, it } from 'vitest';
import { partiesManifest } from './manifest';

describe('partiesManifest', () => {
  it('declares customer and supplier permissions', () => {
    expect(permissionKeys(partiesManifest)).toEqual([
      'parties.customer.view',
      'parties.customer.create',
      'parties.customer.edit',
      'parties.customer.archive',
      'parties.supplier.view',
      'parties.supplier.create',
      'parties.supplier.edit',
      'parties.supplier.archive',
    ]);
  });
});

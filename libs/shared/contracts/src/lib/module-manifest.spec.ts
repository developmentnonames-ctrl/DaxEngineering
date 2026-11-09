import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  assertCatalog,
  defineModule,
  ManifestError,
  permissionKeys,
  type PermissionKeysOf,
} from './module-manifest.js';

const sample = defineModule({
  key: 'sample',
  name: 'Sample',
  dependsOn: [],
  features: {
    grn: { name: 'Goods received', actions: { view: {}, post: {} } },
    count: { name: 'Counts', actions: { approve: { approval: true } } },
  },
  numberSeries: [
    {
      docType: 'GRN',
      name: 'Goods received note',
      subtypes: { FOR: 'Foreign' },
    },
  ],
  menu: [
    {
      key: 'sample.grn',
      label: 'GRN',
      path: '/grn',
      permission: 'sample.grn.view',
    },
  ],
  defaultGrants: {
    stores_manager: { '*': 'ALL' },
    stores_keeper: { 'grn.view': 'ALL' },
  },
});

describe('defineModule', () => {
  it('derives typed permission keys', () => {
    expectTypeOf<PermissionKeysOf<typeof sample>>().toEqualTypeOf<
      'sample.grn.view' | 'sample.grn.post' | 'sample.count.approve'
    >();
    expect(permissionKeys(sample)).toEqual([
      'sample.grn.view',
      'sample.grn.post',
      'sample.count.approve',
    ]);
  });

  const base = {
    key: 'm',
    name: 'M',
    dependsOn: [],
    features: { a: { name: 'A', actions: { view: {} } } },
  };

  it.each([
    ['bad module key', { ...base, key: 'Bad-Key' }],
    ['self dependency', { ...base, dependsOn: ['m'] }],
    ['no features', { ...base, features: {} }],
    [
      'feature without actions',
      { ...base, features: { a: { name: 'A', actions: {} } } },
    ],
    [
      'bad action key',
      { ...base, features: { a: { name: 'A', actions: { 'Do-It': {} } } } },
    ],
    [
      'empty scope list',
      {
        ...base,
        features: { a: { name: 'A', actions: { view: { scopes: [] } } } },
      },
    ],
    [
      'bad doc type',
      { ...base, numberSeries: [{ docType: 'grn', name: 'x' }] },
    ],
    [
      'duplicate series',
      {
        ...base,
        numberSeries: [
          { docType: 'GRN', name: 'x' },
          { docType: 'GRN', name: 'y' },
        ],
      },
    ],
    [
      'menu with unknown permission',
      {
        ...base,
        menu: [{ key: 'x', label: 'X', path: '/', permission: 'm.a.edit' }],
      },
    ],
    [
      'default grant on unknown action',
      { ...base, defaultGrants: { r: { 'a.edit': 'ALL' } } },
    ],
  ])('rejects %s', (_name, manifest) => {
    expect(() => defineModule(manifest as never)).toThrow(ManifestError);
  });
});

describe('assertCatalog', () => {
  const mod = (key: string, dependsOn: string[] = []) =>
    defineModule({
      key,
      name: key,
      dependsOn,
      features: { a: { name: 'A', actions: { view: {} } } },
    });

  it('orders modules so dependencies come first', () => {
    const ordered = assertCatalog([
      mod('inventory', ['parties']),
      mod('parties'),
    ]);
    expect(ordered.map((m) => m.key)).toEqual(['parties', 'inventory']);
  });

  it('rejects duplicates, missing dependencies and cycles', () => {
    expect(() => assertCatalog([mod('a'), mod('a')])).toThrow(
      /installed twice/,
    );
    expect(() => assertCatalog([mod('a', ['b'])])).toThrow(/not installed/);
    expect(() => assertCatalog([mod('a', ['b']), mod('b', ['a'])])).toThrow(
      /cycle/,
    );
  });
});

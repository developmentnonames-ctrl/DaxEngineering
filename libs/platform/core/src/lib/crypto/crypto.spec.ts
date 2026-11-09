import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Prisma } from '@dax/platform-db';
import { defineEntity, type EntityDef } from '../acm/entity';
import {
  aadFor,
  FieldCrypto,
  FieldCryptoError,
  KeyRingError,
  parseKeyRing,
} from './field-crypto';
import { rotateEncryptedColumns, type RotationClient } from './rotation';

const k1 = randomBytes(32).toString('base64');
const k2 = randomBytes(32).toString('base64');
const ring = (active = 'k2') => parseKeyRing(`k1:${k1},k2:${k2}`, active);
const aad = aadFor('commercial.cost', 'unitCost', 'row-1');

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a throw');
}

describe('parseKeyRing', () => {
  it('reads ids and 32-byte keys and the active id', () => {
    const r = ring();
    expect([...r.keys.keys()]).toEqual(['k1', 'k2']);
    expect(r.keys.get('k1')?.length).toBe(32);
    expect(r.active).toBe('k2');
  });

  it.each([
    ['', 'k1', /has no keys/],
    [`k1${k1}`, 'k1', /entry 1 must look like/],
    [`K1:${k1}`, 'k1', /entry 1 has an invalid id/],
    [`k1:${k1},k1:${k2}`, 'k1', /entry 2 repeats key id "k1"/],
    [`k1:${randomBytes(16).toString('base64')}`, 'k1', /32 bytes/],
    [`k1:not*base64`, 'k1', /32 bytes/],
    [`k1:${k1}`, 'k9', /must be one of the configured key ids: k1/],
  ])('rejects %#', (keys, active, message) => {
    const error = errorOf(() => parseKeyRing(keys, active));
    expect(error).toBeInstanceOf(KeyRingError);
    expect(error.message).toMatch(message);
  });

  it('never puts key material in error messages', () => {
    const short = randomBytes(16).toString('base64');
    const cases: [string, string][] = [
      [`k1:${short}`, 'k1'],
      [`${k1}`, 'k1'],
      [`${k1.slice(0, 10)}:${k2}`, 'k1'],
      [`k1:${k1}`, k2],
    ];
    for (const [keys, active] of cases) {
      const { message } = errorOf(() => parseKeyRing(keys, active));
      for (const secret of [k1, k2, short, k1.slice(0, 10)]) {
        expect(message).not.toContain(secret);
      }
    }
  });
});

describe('FieldCrypto', () => {
  const crypto = new FieldCrypto(ring());

  it('round trips with a fresh IV per value', () => {
    const a = crypto.encrypt(aad, '1250.00');
    const b = crypto.encrypt(aad, '1250.00');
    expect(a).toMatch(/^v1:k2:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
    expect(crypto.decrypt(aad, a)).toBe('1250.00');
    expect(crypto.decrypt(aad, crypto.encrypt(aad, ''))).toBe('');
    expect(crypto.decrypt(aad, crypto.encrypt(aad, 'ශ්‍රී ලංකා'))).toBe(
      'ශ්‍රී ලංකා',
    );
  });

  it('rejects a tampered tag or ciphertext', () => {
    const envelope = crypto.encrypt(aad, 'secret');
    const [v, id, iv, sealed] = envelope.split(':');
    const bytes = Buffer.from(sealed, 'base64url');
    bytes[bytes.length - 1] ^= 1;
    const badTag = [v, id, iv, bytes.toString('base64url')].join(':');
    expect(() => crypto.decrypt(aad, badTag)).toThrow(FieldCryptoError);
    const bytes2 = Buffer.from(sealed, 'base64url');
    bytes2[0] ^= 1;
    const badBody = [v, id, iv, bytes2.toString('base64url')].join(':');
    expect(() => crypto.decrypt(aad, badBody)).toThrow(/failed authentication/);
  });

  it('binds each value to its entity, field and row', () => {
    const envelope = crypto.encrypt(aad, 'secret');
    expect(() =>
      crypto.decrypt(aadFor('commercial.cost', 'unitCost', 'row-2'), envelope),
    ).toThrow(FieldCryptoError);
    expect(() =>
      crypto.decrypt(aadFor('commercial.cost', 'listPrice', 'row-1'), envelope),
    ).toThrow(FieldCryptoError);
  });

  it('rejects malformed envelopes and unknown key ids', () => {
    for (const bad of [
      '',
      'plain',
      'v2:k2:a:b',
      'v1:k2:short:abc',
      'v1:k2:a:b:c',
    ]) {
      expect(() => crypto.decrypt(aad, bad)).toThrow(/malformed/);
    }
    const other = new FieldCrypto(
      parseKeyRing(`k3:${randomBytes(32).toString('base64')}`, 'k3'),
    );
    expect(() => crypto.decrypt(aad, other.encrypt(aad, 'x'))).toThrow(
      /Unknown encryption key id "k3"/,
    );
  });

  it('decrypts old keys and flags them for rotation', () => {
    const old = new FieldCrypto(ring('k1'));
    const envelope = old.encrypt(aad, 'secret');
    expect(envelope.startsWith('v1:k1:')).toBe(true);
    expect(crypto.needsRotation(envelope)).toBe(true);
    expect(crypto.decrypt(aad, envelope)).toBe('secret');
    expect(crypto.needsRotation(crypto.encrypt(aad, 'secret'))).toBe(false);
  });

  it('exposes a visibility decryptor using the AAD convention', () => {
    const envelope = crypto.encrypt(aad, 'secret');
    expect(
      crypto.decryptor('commercial.cost', 'unitCost', 'row-1', envelope),
    ).toBe('secret');
  });

  it('builds from options', () => {
    const built = FieldCrypto.fromOptions({
      keys: `k1:${k1},k2:${k2}`,
      activeKey: 'k1',
    });
    expect(built.activeKeyId).toBe('k1');
  });
});

describe('rotateEncryptedColumns', () => {
  const costEntity = defineEntity({
    key: 'commercial.cost',
    moduleKey: 'commercial',
    label: 'Costs',
    table: 'commercial.item_cost',
    fields: {
      id: { label: 'ID', tier: 'INTERNAL', locked: true },
      unitCost: { label: 'Unit cost', tier: 'RESTRICTED', encrypted: true },
      note: { label: 'Note', tier: 'INTERNAL' },
    },
  });

  interface Row {
    ctid: string;
    id: string;
    unit_cost: string | null;
  }

  function fakePrisma(rows: Row[]) {
    const statements: Prisma.Sql[] = [];
    let transactions = 0;
    const tx = {
      $queryRaw: async (query: Prisma.Sql) => {
        statements.push(query);
        const [pattern, limit] = query.values as [string, number];
        const prefix = pattern.slice(0, -1);
        return rows
          .filter(
            (r) => r.unit_cost !== null && !r.unit_cost.startsWith(prefix),
          )
          .slice(0, limit)
          .map((r) => ({ ctid: r.ctid, id: r.id, value: r.unit_cost }));
      },
      $executeRaw: async (query: Prisma.Sql) => {
        statements.push(query);
        const [next, ctid, old] = query.values as string[];
        const row = rows.find((r) => r.ctid === ctid && r.unit_cost === old);
        if (row) row.unit_cost = next;
        return row ? 1 : 0;
      },
    };
    const prisma = {
      $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => {
        transactions += 1;
        return fn(tx);
      },
    } as unknown as RotationClient;
    return { prisma, statements, transactions: () => transactions };
  }

  it('re-encrypts rows not under the active key, in batches', async () => {
    const old = new FieldCrypto(ring('k1'));
    const current = new FieldCrypto(ring('k2'));
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => {
      const id = `row-${i}`;
      const signer = i === 4 ? current : old;
      return {
        ctid: `(0,${i})`,
        id,
        unit_cost: signer.encrypt(
          aadFor(costEntity.key, 'unitCost', id),
          `${i}00`,
        ),
      };
    });
    rows.push({ ctid: '(0,9)', id: 'row-9', unit_cost: null });
    const fake = fakePrisma(rows);

    const counts = await rotateEncryptedColumns(
      fake.prisma,
      current,
      [costEntity],
      2,
    );

    expect(counts).toEqual([
      { entityKey: 'commercial.cost', field: 'unitCost', rotated: 4 },
    ]);
    expect(fake.transactions()).toBe(3);
    for (const [i, row] of rows.slice(0, 5).entries()) {
      expect(row.unit_cost?.startsWith('v1:k2:')).toBe(true);
      expect(
        current.decrypt(
          aadFor(costEntity.key, 'unitCost', row.id),
          row.unit_cost ?? '',
        ),
      ).toBe(`${i}00`);
    }
    const select = fake.statements[0];
    expect(select.sql).toContain('FROM "commercial"."item_cost"');
    expect(select.sql).toContain('"unit_cost" NOT LIKE ?');
    expect(select.values).toEqual(['v1:k2:%', 2]);
  });

  it('refuses unsafe table or column names before running SQL', async () => {
    const fake = fakePrisma([]);
    const crypto = new FieldCrypto(ring());
    const badTable = {
      ...costEntity,
      table: 'commercial.item_cost; DROP TABLE x',
    } as EntityDef;
    const badColumn = {
      ...costEntity,
      fields: {
        unitCost: {
          label: 'x',
          tier: 'RESTRICTED',
          encrypted: true,
          column: 'a"b',
        },
      },
    } as EntityDef;
    await expect(
      rotateEncryptedColumns(fake.prisma, crypto, [badTable]),
    ).rejects.toThrow(/Unsafe table/);
    await expect(
      rotateEncryptedColumns(fake.prisma, crypto, [badColumn]),
    ).rejects.toThrow(/Unsafe column/);
    expect(fake.statements).toHaveLength(0);
  });

  it('skips entities without encrypted fields', async () => {
    const fake = fakePrisma([]);
    const plain = {
      ...costEntity,
      fields: { id: costEntity.fields.id },
    } as EntityDef;
    expect(
      await rotateEncryptedColumns(fake.prisma, new FieldCrypto(ring()), [
        plain,
      ]),
    ).toEqual([]);
  });
});

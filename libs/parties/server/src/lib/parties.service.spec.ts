import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuditEntryInput,
  type AuditService,
  type CatalogField,
  type NextNumberInput,
  type NumberingService,
  type Policy,
  resolvePolicy,
  type RoleInput,
} from '@dax/platform-core';
import type { PrismaService } from '@dax/platform-db';
import { PARTIES_ENTITIES } from './entities';
import { readCsvBody } from './http';
import { CUSTOMERS, type PartyTable, SUPPLIERS } from './kinds';
import { PartiesService } from './parties.service';
import type { Row } from './csv-import';

const ACTOR_ID = '0190a000-0000-7000-8000-000000000001';
const ID = '0190a000-0000-7000-8000-0000000000aa';

class FakeTable implements PartyTable {
  rows: Row[] = [];
  private seq = 0;

  private shape(row: Row, select?: Record<string, true>): Row {
    return select
      ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]))
      : { ...row };
  }

  private matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([k, cond]) => {
      if (cond !== null && typeof cond === 'object' && 'in' in cond) {
        return (cond.in as unknown[]).includes(row[k]);
      }
      return row[k] === cond;
    });
  }

  seed(row: Row): Row {
    const full = {
      id: ID,
      code: 'CUS-0001',
      name: 'Acme Motors',
      contactPerson: 'Head of Stores',
      phone: '0112345678',
      email: 'stores@acme.test',
      address: null,
      taxId: null,
      notes: null,
      active: true,
      version: 1,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      createdBy: ACTOR_ID,
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      updatedBy: ACTOR_ID,
      ...row,
    };
    this.rows.push(full);
    return full;
  }

  async findUnique(args: {
    where: { id: string };
    select?: Record<string, true>;
  }) {
    const row = this.rows.find((r) => r['id'] === args.where.id);
    return row ? this.shape(row, args.select) : null;
  }

  async findMany(args: { where: Row; select: Record<string, true> }) {
    return this.rows
      .filter((r) => this.matches(r, args.where))
      .map((r) => this.shape(r, args.select));
  }

  async create(args: { data: Row; select: Record<string, true> }) {
    const row = this.seed({ ...args.data, id: `new-${++this.seq}` });
    return this.shape(row, args.select);
  }

  async createMany(args: { data: Row[] }) {
    for (const data of args.data)
      this.seed({ ...data, id: `new-${++this.seq}` });
    return { count: args.data.length };
  }

  async updateMany(args: {
    where: { id: string; version: number };
    data: Row;
  }) {
    const row = this.rows.find(
      (r) => r['id'] === args.where.id && r['version'] === args.where.version,
    );
    if (!row) return { count: 0 };
    const { version, ...rest } = args.data;
    Object.assign(row, rest);
    if (version) row['version'] = Number(row['version']) + 1;
    return { count: 1 };
  }
}

function setup(options: { lostRace?: boolean } = {}) {
  const customer = new FakeTable();
  const supplier = new FakeTable();
  const tx = { customer, supplier };
  let inTx = false;
  const numberCalls: {
    inTx: boolean;
    sameTx: boolean;
    input: NextNumberInput;
  }[] = [];
  const audits: { entry: AuditEntryInput; inTx: boolean }[] = [];
  let counter = 0;

  const prisma = {
    customer,
    supplier,
    async $transaction<T>(fn: (client: typeof tx) => Promise<T>): Promise<T> {
      inTx = true;
      try {
        return await fn(tx);
      } finally {
        inTx = false;
      }
    },
  };
  const numbering = {
    async next(client: unknown, input: NextNumberInput) {
      numberCalls.push({ inTx, sameTx: client === tx, input });
      counter += 1;
      return {
        number: `${input.docType}-${String(counter).padStart(4, '0')}`,
        seq: counter,
        periodKey: 'ALL',
      };
    },
  };
  const audit = {
    async record(entry: AuditEntryInput, client?: unknown) {
      audits.push({ entry, inTx: inTx && client === tx });
    },
  };
  if (options.lostRace) {
    const original = customer.updateMany.bind(customer);
    customer.updateMany = async (args) => {
      const row = customer.rows.find((r) => r['id'] === args.where.id);
      if (row) row['version'] = Number(row['version']) + 1;
      return original(args);
    };
  }
  const service = new PartiesService(
    prisma as unknown as PrismaService,
    numbering as unknown as NumberingService,
    audit as unknown as AuditService,
  );
  return { service, customer, supplier, numberCalls, audits };
}

const catalogFields: CatalogField[] = PARTIES_ENTITIES.flatMap((e) =>
  Object.entries(e.fields).map(([name, f]) => ({
    id: `${e.key}.${name}`,
    entityKey: e.key,
    moduleKey: 'parties',
    name,
    tier: f.tier,
    locked: f.locked ?? false,
    writable: f.writable ?? false,
  })),
);

function policyWith(fieldGrants: RoleInput['fieldGrants'] = []): Policy {
  return resolvePolicy({
    userId: ACTOR_ID,
    departmentIds: [],
    roles: [
      {
        id: 'r1',
        isSuperAdmin: false,
        require2fa: false,
        expiresAt: null,
        permissions: [],
        fieldGrants,
      },
    ],
    overrides: [],
    enabledModules: new Set(['parties']),
    catalog: { permissions: new Map(), fields: catalogFields },
    now: new Date('2026-11-10T00:00:00Z'),
    version: '1',
  });
}

const contactGrants = (canWrite: boolean): RoleInput['fieldGrants'] =>
  ['contactPerson', 'phone', 'email', 'address', 'taxId'].map((f) => ({
    fieldId: `parties.customer.${f}`,
    canRead: true,
    canWrite,
  }));

const plain = { userId: ACTOR_ID, policy: policyWith() };
const contacts = { userId: ACTOR_ID, policy: policyWith(contactGrants(true)) };

function errorCode(error: unknown): unknown {
  return error instanceof HttpException
    ? (error.getResponse() as { code?: string }).code
    : undefined;
}

describe('PartiesService visibility', () => {
  it('leaves Confidential contact fields out without a grant', async () => {
    const { service, customer } = setup();
    customer.seed({});
    const dto = await service.get(CUSTOMERS, plain.policy, ID);
    expect(dto).toMatchObject({
      id: ID,
      code: 'CUS-0001',
      name: 'Acme Motors',
      active: true,
      version: 1,
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    for (const key of ['contactPerson', 'phone', 'email', 'address', 'taxId']) {
      expect(dto).not.toHaveProperty(key);
    }
    expect(dto).toHaveProperty('notes');
    expect(dto).not.toHaveProperty('createdBy');
  });

  it('includes contact fields once read is granted', async () => {
    const { service, customer } = setup();
    customer.seed({});
    const dto = await service.get(CUSTOMERS, contacts.policy, ID);
    expect(dto.phone).toBe('0112345678');
    expect(dto.email).toBe('stores@acme.test');
  });

  it('returns 404 for an unknown id', async () => {
    const { service } = setup();
    await expect(
      service.get(CUSTOMERS, plain.policy, ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PartiesService create', () => {
  it('assigns the code inside the transaction and audits it there', async () => {
    const { service, numberCalls, audits, customer } = setup();
    const dto = await service.create(CUSTOMERS, contacts, {
      name: 'Acme Motors',
      phone: '0771234567',
    });
    expect(numberCalls).toEqual([
      {
        inTx: true,
        sameTx: true,
        input: expect.objectContaining({ docType: 'CUS' }),
      },
    ]);
    expect(dto.code).toBe('CUS-0001');
    expect(customer.rows[0]).toMatchObject({
      createdBy: ACTOR_ID,
      updatedBy: ACTOR_ID,
    });
    expect(audits).toEqual([
      {
        inTx: true,
        entry: expect.objectContaining({
          action: 'create',
          entityKey: 'parties.customer',
        }),
      },
    ]);
  });

  it('skips numbers already taken by imported codes', async () => {
    const { service, customer } = setup();
    customer.seed({ id: 'other', code: 'CUS-0001' });
    const dto = await service.create(CUSTOMERS, plain, { name: 'Beta' });
    expect(dto.code).toBe('CUS-0002');
  });

  it('uses the SUP series for suppliers', async () => {
    const { service, numberCalls } = setup();
    const dto = await service.create(SUPPLIERS, plain, { name: 'Gamma' });
    expect(dto.code).toBe('SUP-0001');
    expect(dto.isForeign).toBe(false);
    expect(numberCalls[0]?.input.docType).toBe('SUP');
  });

  it('refuses contact details without write access', async () => {
    const { service, numberCalls } = setup();
    await expect(
      service.create(CUSTOMERS, plain, { name: 'Acme', phone: '0771234567' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(numberCalls).toEqual([]);
  });

  it('rejects invalid input', async () => {
    const { service } = setup();
    await expect(
      service.create(CUSTOMERS, plain, { name: '', code: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PartiesService update and archive', () => {
  it('returns 409 STALE for an old version', async () => {
    const { service, customer } = setup();
    customer.seed({ version: 3 });
    const error = await service
      .update(CUSTOMERS, plain, ID, { name: 'New', version: 2 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(errorCode(error)).toBe('STALE');
  });

  it('returns 409 STALE when another write lands first', async () => {
    const { service, customer } = setup({ lostRace: true });
    customer.seed({});
    const error = await service
      .update(CUSTOMERS, plain, ID, { name: 'New', version: 1 })
      .catch((e: unknown) => e);
    expect(errorCode(error)).toBe('STALE');
  });

  it('updates changed fields, bumps the version and audits before/after', async () => {
    const { service, customer, audits } = setup();
    customer.seed({});
    const dto = await service.update(CUSTOMERS, plain, ID, {
      name: 'Acme Holdings',
      notes: null,
      version: 1,
    });
    expect(dto).toMatchObject({ name: 'Acme Holdings', version: 2 });
    expect(audits[0]?.entry).toMatchObject({
      action: 'update',
      before: { name: 'Acme Motors' },
      after: { name: 'Acme Holdings' },
    });
  });

  it('ignores unchanged readable fields the user cannot write', async () => {
    const { service, customer } = setup();
    customer.seed({});
    const readOnly = {
      userId: ACTOR_ID,
      policy: policyWith(contactGrants(false)),
    };
    await expect(
      service.update(CUSTOMERS, readOnly, ID, {
        phone: '0112345678',
        name: 'Renamed',
        version: 1,
      }),
    ).resolves.toMatchObject({ name: 'Renamed' });
    await expect(
      service.update(CUSTOMERS, readOnly, ID, { phone: '999', version: 2 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks writes to fields the user cannot see', async () => {
    const { service, customer } = setup();
    customer.seed({});
    await expect(
      service.update(CUSTOMERS, plain, ID, { phone: '0112345678', version: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('archives and restores', async () => {
    const { service, customer, audits } = setup();
    customer.seed({});
    const archived = await service.setActive(CUSTOMERS, plain, ID, 1, false);
    expect(archived).toMatchObject({ active: false, version: 2 });
    const restored = await service.setActive(CUSTOMERS, plain, ID, 2, true);
    expect(restored).toMatchObject({ active: true, version: 3 });
    expect(audits.map((a) => a.entry.action)).toEqual(['archive', 'restore']);
  });
});

describe('PartiesService import', () => {
  const csv = 'code,name,email\nCUS-0001,Acme,\n,Beta,\nX-9,Gamma,\n';

  it('reports codes already in the database and writes nothing', async () => {
    const { service, customer, numberCalls } = setup();
    customer.seed({ code: 'CUS-0001' });
    const result = await service.importCsv(CUSTOMERS, plain, csv, false);
    expect(result).toEqual({
      dryRun: false,
      total: 3,
      created: 0,
      errors: [
        { row: 1, field: 'code', message: 'Code CUS-0001 is already in use.' },
      ],
    });
    expect(customer.rows).toHaveLength(1);
    expect(numberCalls).toEqual([]);
  });

  it('never writes or numbers on a dry run', async () => {
    const { service, customer, numberCalls, audits } = setup();
    const result = await service.importCsv(CUSTOMERS, plain, csv, true);
    expect(result).toEqual({ dryRun: true, total: 3, created: 3, errors: [] });
    expect(customer.rows).toEqual([]);
    expect(numberCalls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('creates every row in one transaction, skipping codes in the file', async () => {
    const { service, customer, numberCalls, audits } = setup();
    const result = await service.importCsv(CUSTOMERS, plain, csv, false);
    expect(result).toEqual({ dryRun: false, total: 3, created: 3, errors: [] });
    expect(customer.rows.map((r) => [r['code'], r['name']])).toEqual([
      ['CUS-0001', 'Acme'],
      ['CUS-0002', 'Beta'],
      ['X-9', 'Gamma'],
    ]);
    expect(numberCalls.every((c) => c.inTx && c.sameTx)).toBe(true);
    expect(audits).toEqual([
      {
        inTx: true,
        entry: expect.objectContaining({
          action: 'import',
          after: { rows: 3, created: 3, withOwnCode: 2 },
        }),
      },
    ]);
  });

  it('reports columns the user may not write', async () => {
    const { service } = setup();
    const result = await service.importCsv(
      CUSTOMERS,
      plain,
      'name,phone\nAcme,0771234567\n',
      true,
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 0, field: 'phone' }),
    ]);
    expect(result.created).toBe(0);
  });
});

describe('readCsvBody', () => {
  function request(body: Buffer, headers: Record<string, string>) {
    return Object.assign(Readable.from([body]), {
      headers,
    }) as unknown as IncomingMessage;
  }

  it('reads UTF-8 CSV text', async () => {
    const req = request(Buffer.from('name\nCafé\n'), {
      'content-type': 'text/csv; charset=utf-8',
    });
    await expect(readCsvBody(req)).resolves.toBe('name\nCafé\n');
  });

  it('rejects other content types, oversized bodies and bad encoding', async () => {
    await expect(
      readCsvBody(
        request(Buffer.from('{}'), { 'content-type': 'application/json' }),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readCsvBody(
        request(Buffer.alloc(20, 'a'), { 'content-type': 'text/csv' }),
        10,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readCsvBody(
        request(Buffer.from([0xff, 0xfe, 0x41]), {
          'content-type': 'text/csv',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

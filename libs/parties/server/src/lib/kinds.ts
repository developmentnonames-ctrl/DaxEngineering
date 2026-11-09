import {
  CUSTOMER_CSV_COLUMNS,
  CustomerDto,
  CustomerInput,
  CustomerUpdate,
  SUPPLIER_CSV_COLUMNS,
  SupplierDto,
  SupplierInput,
  SupplierUpdate,
} from '@dax/parties-contract';
import type { EntityDef } from '@dax/platform-core';
import type { PrismaService, TransactionClient } from '@dax/platform-db';
import type { z } from 'zod';
import type { Row } from './csv-import';
import { customerEntity, supplierEntity } from './entities';

type Select = Record<string, true>;

export interface PartyTable {
  findUnique(args: {
    where: { id: string };
    select?: Select;
  }): Promise<Row | null>;
  findMany(args: { where: Row; select: Select }): Promise<Row[]>;
  create(args: { data: Row; select: Select }): Promise<Row>;
  createMany(args: { data: Row[] }): Promise<{ count: number }>;
  updateMany(args: {
    where: { id: string; version: number };
    data: Row;
  }): Promise<{ count: number }>;
}

export type Db = PrismaService | TransactionClient;

export interface PartyKind<D extends Row = Row> {
  key: 'customer' | 'supplier';
  label: string;
  entity: EntityDef;
  docType: string;
  sqlTable: string;
  input: z.ZodType<Row>;
  update: z.ZodType<Row & { version: number }>;
  dtoKeys: readonly (keyof D & string)[];
  csvColumns: readonly string[];
  csvBooleans: readonly string[];
  createDefaults: Row;
  table(db: Db): PartyTable;
}

export const CUSTOMERS: PartyKind<CustomerDto> = {
  key: 'customer',
  label: 'Customer',
  entity: customerEntity,
  docType: 'CUS',
  sqlTable: '"parties"."customer"',
  input: CustomerInput,
  update: CustomerUpdate,
  dtoKeys: Object.keys(CustomerDto.shape) as (keyof CustomerDto)[],
  csvColumns: CUSTOMER_CSV_COLUMNS,
  csvBooleans: [],
  createDefaults: {},
  table: (db) => db.customer as unknown as PartyTable,
};

export const SUPPLIERS: PartyKind<SupplierDto> = {
  key: 'supplier',
  label: 'Supplier',
  entity: supplierEntity,
  docType: 'SUP',
  sqlTable: '"parties"."supplier"',
  input: SupplierInput,
  update: SupplierUpdate,
  dtoKeys: Object.keys(SupplierDto.shape) as (keyof SupplierDto)[],
  csvColumns: SUPPLIER_CSV_COLUMNS,
  csvBooleans: ['is_foreign'],
  createDefaults: { isForeign: false },
  table: (db) => db.supplier as unknown as PartyTable,
};

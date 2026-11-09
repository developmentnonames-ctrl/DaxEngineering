import type { Prisma } from '@dax/platform-db';
import { defineEntity, type FieldMeta } from '@dax/platform-core';

type CustomerField = keyof typeof Prisma.CustomerScalarFieldEnum;
type SupplierField = keyof typeof Prisma.SupplierScalarFieldEnum;
type SharedField = CustomerField & SupplierField;

const shared: Record<SharedField, FieldMeta> = {
  id: { label: 'ID', tier: 'INTERNAL', locked: true },
  code: {
    label: 'Code',
    tier: 'INTERNAL',
    locked: true,
    filterable: true,
    sortable: true,
  },
  name: {
    label: 'Name',
    tier: 'INTERNAL',
    locked: true,
    writable: true,
    filterable: true,
    sortable: true,
  },
  contactPerson: {
    label: 'Contact person',
    tier: 'CONFIDENTIAL',
    writable: true,
    group: 'Contact',
  },
  phone: {
    label: 'Phone',
    tier: 'CONFIDENTIAL',
    writable: true,
    group: 'Contact',
  },
  email: {
    label: 'Email',
    tier: 'CONFIDENTIAL',
    writable: true,
    group: 'Contact',
  },
  address: {
    label: 'Address',
    tier: 'CONFIDENTIAL',
    writable: true,
    group: 'Contact',
  },
  taxId: {
    label: 'Tax ID',
    tier: 'CONFIDENTIAL',
    writable: true,
    group: 'Contact',
  },
  notes: { label: 'Notes', tier: 'INTERNAL', writable: true },
  active: { label: 'Active', tier: 'INTERNAL', locked: true, filterable: true },
  version: { label: 'Version', tier: 'INTERNAL', locked: true },
  createdAt: { label: 'Created', tier: 'INTERNAL', locked: true },
  createdBy: { label: 'Created by', tier: 'INTERNAL' },
  updatedAt: { label: 'Updated', tier: 'INTERNAL', locked: true },
  updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
};

export const customerEntity = defineEntity<CustomerField>({
  key: 'parties.customer',
  moduleKey: 'parties',
  label: 'Customers',
  table: 'parties.customer',
  fields: shared,
});

export const supplierEntity = defineEntity<SupplierField>({
  key: 'parties.supplier',
  moduleKey: 'parties',
  label: 'Suppliers',
  table: 'parties.supplier',
  fields: {
    ...shared,
    country: {
      label: 'Country',
      tier: 'INTERNAL',
      writable: true,
      filterable: true,
    },
    isForeign: {
      label: 'Foreign supplier',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
      filterable: true,
    },
  },
});

export const PARTIES_ENTITIES = [customerEntity, supplierEntity];

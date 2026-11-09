import type { Prisma } from '@dax/platform-db';
import { defineEntity, type EntityDef } from '@dax/platform-core';

type ItemField = keyof typeof Prisma.ItemScalarFieldEnum;
type BinField = keyof typeof Prisma.BinScalarFieldEnum;
type BrandField = keyof typeof Prisma.BrandScalarFieldEnum;
type MachineModelField = keyof typeof Prisma.MachineModelScalarFieldEnum;

export const itemEntity = defineEntity<ItemField>({
  key: 'inventory.item',
  moduleKey: 'inventory',
  label: 'Items',
  table: 'inventory.item',
  fields: {
    id: { label: 'ID', tier: 'INTERNAL', locked: true },
    partNo: {
      label: 'Part number',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
      filterable: true,
      sortable: true,
    },
    partNoNorm: { label: 'Part number (search)', tier: 'INTERNAL' },
    brandId: {
      label: 'Brand',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
      filterable: true,
    },
    description: {
      label: 'Description',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
      filterable: true,
    },
    uom: { label: 'Unit', tier: 'INTERNAL', locked: true, writable: true },
    allowFraction: {
      label: 'Allows fractions',
      tier: 'INTERNAL',
      locked: true,
    },
    minQty: {
      label: 'Minimum quantity',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
    },
    defaultBinId: {
      label: 'Default bin',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
    },
    supersededById: {
      label: 'Replaced by',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
    },
    status: {
      label: 'Status',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
      filterable: true,
    },
    qrToken: { label: 'QR token', tier: 'INTERNAL' },
    notes: { label: 'Notes', tier: 'INTERNAL', writable: true },
    version: { label: 'Version', tier: 'INTERNAL', locked: true },
    createdAt: { label: 'Created', tier: 'INTERNAL', locked: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: { label: 'Updated', tier: 'INTERNAL', locked: true },
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const binEntity = defineEntity<BinField>({
  key: 'inventory.bin',
  moduleKey: 'inventory',
  label: 'Bins',
  table: 'inventory.bin',
  fields: {
    id: { label: 'ID', tier: 'INTERNAL', locked: true },
    storeId: { label: 'Store', tier: 'INTERNAL', locked: true },
    zoneId: {
      label: 'Zone',
      tier: 'INTERNAL',
      locked: true,
      filterable: true,
    },
    code: {
      label: 'Bin code',
      tier: 'INTERNAL',
      locked: true,
      filterable: true,
      sortable: true,
    },
    rack: { label: 'Rack', tier: 'INTERNAL', locked: true },
    shelf: { label: 'Shelf', tier: 'INTERNAL', locked: true },
    position: { label: 'Position', tier: 'INTERNAL', locked: true },
    kind: {
      label: 'Kind',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
      filterable: true,
    },
    qrToken: { label: 'QR token', tier: 'INTERNAL' },
    active: { label: 'Active', tier: 'INTERNAL', locked: true, writable: true },
    notes: { label: 'Notes', tier: 'INTERNAL', writable: true },
    version: { label: 'Version', tier: 'INTERNAL', locked: true },
    createdAt: { label: 'Created', tier: 'INTERNAL', locked: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: { label: 'Updated', tier: 'INTERNAL', locked: true },
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const brandEntity = defineEntity<BrandField>({
  key: 'inventory.brand',
  moduleKey: 'inventory',
  label: 'Brands',
  table: 'inventory.brand',
  fields: {
    id: { label: 'ID', tier: 'INTERNAL', locked: true },
    name: { label: 'Name', tier: 'INTERNAL', locked: true, writable: true },
    active: { label: 'Active', tier: 'INTERNAL', locked: true, writable: true },
    createdAt: { label: 'Created', tier: 'INTERNAL', locked: true },
    updatedAt: { label: 'Updated', tier: 'INTERNAL', locked: true },
  },
});

export const machineModelEntity = defineEntity<MachineModelField>({
  key: 'inventory.machine_model',
  moduleKey: 'inventory',
  label: 'Machine models',
  table: 'inventory.machine_model',
  fields: {
    id: { label: 'ID', tier: 'INTERNAL', locked: true },
    name: { label: 'Name', tier: 'INTERNAL', locked: true, writable: true },
    brandId: {
      label: 'Brand',
      tier: 'INTERNAL',
      locked: true,
      writable: true,
    },
    active: { label: 'Active', tier: 'INTERNAL', locked: true, writable: true },
    createdAt: { label: 'Created', tier: 'INTERNAL', locked: true },
    updatedAt: { label: 'Updated', tier: 'INTERNAL', locked: true },
  },
});

export const INVENTORY_ENTITIES: readonly EntityDef[] = [
  itemEntity,
  binEntity,
  brandEntity,
  machineModelEntity,
];

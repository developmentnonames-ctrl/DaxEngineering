import type { Prisma } from '@dax/platform-db';
import { defineEntity, type EntityDef } from '@dax/platform-core';

type ItemField = keyof typeof Prisma.ItemScalarFieldEnum;
type BinField = keyof typeof Prisma.BinScalarFieldEnum;
type BrandField = keyof typeof Prisma.BrandScalarFieldEnum;
type MachineModelField = keyof typeof Prisma.MachineModelScalarFieldEnum;
type GrnField = keyof typeof Prisma.GrnScalarFieldEnum;
type DiscrepancyField = keyof typeof Prisma.DiscrepancyScalarFieldEnum;
type HoldField = keyof typeof Prisma.HoldScalarFieldEnum;
type MrnField = keyof typeof Prisma.MrnScalarFieldEnum;
type AodField = keyof typeof Prisma.AodScalarFieldEnum;
type ReturnNoteField = keyof typeof Prisma.ReturnNoteScalarFieldEnum;
type StockCountField = keyof typeof Prisma.StockCountScalarFieldEnum;
type WarrantyTagField = keyof typeof Prisma.WarrantyTagScalarFieldEnum;

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
    countId: { label: 'Being counted', tier: 'INTERNAL', locked: true },
    openedAt: { label: 'Opening count done', tier: 'INTERNAL', locked: true },
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

const shown = (label: string) =>
  ({ label, tier: 'INTERNAL', locked: true }) as const;

export const grnEntity = defineEntity<GrnField>({
  key: 'inventory.grn',
  moduleKey: 'inventory',
  label: 'Goods received notes',
  table: 'inventory.grn',
  fields: {
    id: shown('ID'),
    number: { ...shown('GRN number'), filterable: true, sortable: true },
    subtype: { ...shown('Type'), writable: true, filterable: true },
    status: { ...shown('Status'), filterable: true },
    supplierId: { ...shown('Supplier'), filterable: true },
    supplierName: { ...shown('Supplier name'), filterable: true },
    deliveryNote: { ...shown('Delivery note'), writable: true },
    deliveryDate: { ...shown('Delivery date'), writable: true },
    notes: { ...shown('Notes'), writable: true },
    checkedBy: shown('Checked by'),
    checkedAt: shown('Checked'),
    postedBy: shown('Posted by'),
    postedAt: { ...shown('Posted'), sortable: true },
    reversedBy: shown('Reversed by'),
    reversedAt: shown('Reversed'),
    reverseReason: shown('Reason for reversal'),
    version: shown('Version'),
    createdAt: { ...shown('Created'), sortable: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: shown('Updated'),
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const discrepancyEntity = defineEntity<DiscrepancyField>({
  key: 'inventory.discrepancy',
  moduleKey: 'inventory',
  label: 'Shortage and damage',
  table: 'inventory.discrepancy',
  fields: {
    id: shown('ID'),
    grnId: shown('GRN'),
    grnLineId: shown('GRN line'),
    itemId: shown('Item'),
    kind: { ...shown('Kind'), filterable: true },
    qty: shown('Quantity'),
    status: { ...shown('Status'), filterable: true },
    notes: { ...shown('Notes'), writable: true },
    closeNote: shown('Closing note'),
    closedBy: shown('Closed by'),
    closedAt: shown('Closed'),
    version: shown('Version'),
    createdAt: { ...shown('Created'), sortable: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
  },
});

const confidential = (label: string) =>
  ({ label, tier: 'CONFIDENTIAL' }) as const;

export const holdEntity = defineEntity<HoldField>({
  key: 'inventory.hold',
  moduleKey: 'inventory',
  label: 'Stock holds',
  table: 'inventory.hold',
  fields: {
    id: shown('ID'),
    number: { ...shown('Hold number'), filterable: true, sortable: true },
    status: { ...shown('Status'), filterable: true },
    customerId: confidential('Customer'),
    customerName: { ...confidential('Customer name'), filterable: true },
    departmentId: { ...shown('Department'), filterable: true },
    departmentName: shown('Department name'),
    reason: { ...shown('Reason'), writable: true },
    convertedMrnId: shown('Request'),
    releasedBy: shown('Released by'),
    releasedAt: shown('Released'),
    version: shown('Version'),
    createdAt: { ...shown('Created'), sortable: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: shown('Updated'),
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const mrnEntity = defineEntity<MrnField>({
  key: 'inventory.mrn',
  moduleKey: 'inventory',
  label: 'Material requests',
  table: 'inventory.mrn',
  fields: {
    id: shown('ID'),
    number: { ...shown('MRN number'), filterable: true, sortable: true },
    subtype: { ...shown('Type'), writable: true, filterable: true },
    status: { ...shown('Status'), filterable: true },
    departmentId: { ...shown('Department'), writable: true, filterable: true },
    departmentName: shown('Department name'),
    customerId: { ...confidential('Customer'), writable: true },
    customerName: { ...confidential('Customer name'), filterable: true },
    jobNumber: { ...shown('Job number'), writable: true, filterable: true },
    customerPo: { ...shown('Customer PO'), writable: true },
    quotationRef: { ...shown('Quotation reference'), writable: true },
    notes: { ...shown('Notes'), writable: true },
    holdId: shown('Hold'),
    submittedBy: shown('Submitted by'),
    submittedAt: shown('Submitted'),
    checkedBy: shown('Checked by'),
    checkedAt: shown('Checked'),
    closedBy: shown('Closed by'),
    closedAt: shown('Closed'),
    closeReason: shown('Reason for closing'),
    version: shown('Version'),
    createdAt: { ...shown('Created'), sortable: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: shown('Updated'),
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const aodEntity = defineEntity<AodField>({
  key: 'inventory.aod',
  moduleKey: 'inventory',
  label: 'Dispatch notes (AOD)',
  table: 'inventory.aod',
  fields: {
    id: shown('ID'),
    number: { ...shown('AOD number'), filterable: true, sortable: true },
    type: { ...shown('Type'), writable: true, filterable: true },
    status: { ...shown('Status'), filterable: true },
    mrnId: shown('Request'),
    deliverTo: { ...shown('Deliver to'), writable: true },
    vehicleNo: { ...shown('Vehicle'), writable: true },
    notes: { ...shown('Notes'), writable: true },
    issuedBy: shown('Issued by'),
    issuedAt: { ...shown('Issued'), sortable: true },
    signedBy: shown('Signed copy added by'),
    signedAt: shown('Signed copy added'),
    signedFile: shown('Signed copy'),
    version: shown('Version'),
    createdAt: { ...shown('Created'), sortable: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: shown('Updated'),
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const returnNoteEntity = defineEntity<ReturnNoteField>({
  key: 'inventory.return_note',
  moduleKey: 'inventory',
  label: 'Return notes',
  table: 'inventory.return_note',
  fields: {
    id: shown('ID'),
    number: { ...shown('Return number'), filterable: true, sortable: true },
    status: { ...shown('Status'), filterable: true },
    aodId: shown('AOD'),
    departmentId: { ...shown('Department'), writable: true, filterable: true },
    departmentName: shown('Department name'),
    customerId: { ...confidential('Customer'), writable: true },
    customerName: { ...confidential('Customer name'), filterable: true },
    jobNumber: { ...shown('Job number'), writable: true, filterable: true },
    reason: { ...shown('Reason'), writable: true },
    notes: { ...shown('Notes'), writable: true },
    postedBy: shown('Posted by'),
    postedAt: { ...shown('Posted'), sortable: true },
    version: shown('Version'),
    createdAt: { ...shown('Created'), sortable: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: shown('Updated'),
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const stockCountEntity = defineEntity<StockCountField>({
  key: 'inventory.stock_count',
  moduleKey: 'inventory',
  label: 'Stock counts',
  table: 'inventory.stock_count',
  fields: {
    id: shown('ID'),
    number: { ...shown('Count number'), filterable: true, sortable: true },
    kind: { ...shown('Kind'), filterable: true },
    status: { ...shown('Status'), filterable: true },
    blind: shown('Blind count'),
    notes: { ...shown('Notes'), writable: true },
    submittedBy: shown('Submitted by'),
    submittedAt: shown('Submitted'),
    rejectReason: shown('Reason for recount'),
    rejectedBy: shown('Sent back by'),
    rejectedAt: shown('Sent back'),
    approvedBy: shown('Approved by'),
    approvedAt: { ...shown('Approved'), sortable: true },
    cancelledBy: shown('Cancelled by'),
    cancelledAt: shown('Cancelled'),
    cancelReason: shown('Reason for cancelling'),
    version: shown('Version'),
    createdAt: { ...shown('Created'), sortable: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: shown('Updated'),
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const warrantyTagEntity = defineEntity<WarrantyTagField>({
  key: 'inventory.warranty_tag',
  moduleKey: 'inventory',
  label: 'Warranty tags',
  table: 'inventory.warranty_tag',
  fields: {
    id: shown('ID'),
    number: { ...shown('Tag number'), filterable: true, sortable: true },
    status: { ...shown('Status'), filterable: true },
    itemId: { ...shown('Item'), writable: true, filterable: true },
    qty: { ...shown('Quantity'), writable: true },
    serialNo: { ...shown('Serial number'), writable: true, filterable: true },
    machineModelId: { ...shown('Machine model'), writable: true },
    machineSerial: { ...shown('Machine serial'), writable: true },
    jobNumber: { ...shown('Job number'), writable: true, filterable: true },
    customerId: { ...confidential('Customer'), writable: true },
    customerName: { ...confidential('Customer name'), filterable: true },
    supplierId: { ...shown('Supplier'), writable: true },
    supplierName: { ...shown('Supplier name'), filterable: true },
    claimNumber: { ...shown('Claim number'), writable: true, filterable: true },
    fault: { ...shown('Fault'), writable: true },
    binId: shown('Bin'),
    returnLineId: shown('Return line'),
    sentBy: shown('Sent by'),
    sentAt: shown('Sent'),
    outcome: { ...shown('Outcome'), filterable: true },
    closeNote: shown('Closing note'),
    closedBy: shown('Closed by'),
    closedAt: shown('Closed'),
    version: shown('Version'),
    createdAt: { ...shown('Created'), sortable: true },
    createdBy: { label: 'Created by', tier: 'INTERNAL' },
    updatedAt: shown('Updated'),
    updatedBy: { label: 'Updated by', tier: 'INTERNAL' },
  },
});

export const INVENTORY_ENTITIES: readonly EntityDef[] = [
  itemEntity,
  binEntity,
  brandEntity,
  machineModelEntity,
  grnEntity,
  discrepancyEntity,
  holdEntity,
  mrnEntity,
  aodEntity,
  returnNoteEntity,
  stockCountEntity,
  warrantyTagEntity,
];

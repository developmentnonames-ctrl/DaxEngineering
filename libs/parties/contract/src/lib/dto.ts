import { z } from 'zod';
import { OptionalText, PageQuery, pageOf } from '@dax/contracts';

export const PARTY_KINDS = ['customer', 'supplier'] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

const contact = {
  contactPerson: OptionalText(100),
  phone: OptionalText(40),
  email: z
    .union([z.email().max(254), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  address: OptionalText(300),
  taxId: OptionalText(40),
  notes: OptionalText(1000),
};

export const CustomerInput = z.strictObject({
  name: z.string().trim().min(1).max(150),
  ...contact,
});
export type CustomerInput = z.infer<typeof CustomerInput>;

export const SupplierInput = z.strictObject({
  name: z.string().trim().min(1).max(150),
  country: OptionalText(60),
  isForeign: z.boolean().default(false),
  ...contact,
});
export type SupplierInput = z.infer<typeof SupplierInput>;

export const CustomerUpdate = CustomerInput.partial().extend({
  version: z.int(),
});
export type CustomerUpdate = z.infer<typeof CustomerUpdate>;
export const SupplierUpdate = SupplierInput.extend({ isForeign: z.boolean() })
  .partial()
  .extend({ version: z.int() });
export type SupplierUpdate = z.infer<typeof SupplierUpdate>;

const visibleContact = {
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
};

export const CustomerDto = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  version: z.int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ...visibleContact,
});
export type CustomerDto = z.infer<typeof CustomerDto>;

export const SupplierDto = CustomerDto.extend({
  country: z.string().nullable().optional(),
  isForeign: z.boolean(),
});
export type SupplierDto = z.infer<typeof SupplierDto>;

export const CustomerPage = pageOf(CustomerDto);
export type CustomerPage = z.infer<typeof CustomerPage>;
export const SupplierPage = pageOf(SupplierDto);
export type SupplierPage = z.infer<typeof SupplierPage>;

export const PartyQuery = PageQuery.extend({
  active: z.enum(['true', 'false', 'all']).default('true'),
});
export type PartyQuery = z.infer<typeof PartyQuery>;

export const ArchiveInput = z.strictObject({ version: z.int() });

export const CUSTOMER_CSV_COLUMNS = [
  'code',
  'name',
  'contact_person',
  'phone',
  'email',
  'address',
  'tax_id',
  'notes',
] as const;
export const SUPPLIER_CSV_COLUMNS = [
  'code',
  'name',
  'country',
  'is_foreign',
  'contact_person',
  'phone',
  'email',
  'address',
  'tax_id',
  'notes',
] as const;

export const PartyImportQuery = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export type PartyImportQuery = z.infer<typeof PartyImportQuery>;

export const PARTY_IMPORT_MAX_ROWS = 5000;
export const PARTY_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export const PartiesSummary = z.object({
  customers: z.int().nullable(),
  suppliers: z.int().nullable(),
});
export type PartiesSummary = z.infer<typeof PartiesSummary>;

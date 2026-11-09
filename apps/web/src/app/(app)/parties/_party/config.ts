import {
  CUSTOMER_CSV_COLUMNS,
  CustomerDto,
  CustomerInput,
  CustomerPage,
  CustomerUpdate,
  type PartyKind,
  SUPPLIER_CSV_COLUMNS,
  SupplierDto,
  SupplierInput,
  SupplierPage,
  SupplierUpdate,
} from '@dax/parties-contract';
import type { ImportKind } from '../../../../lib/import';

export type { PartyKind };
export type PartyDto = CustomerDto & {
  country?: string | null;
  isForeign?: boolean;
};

export interface PartyConfig {
  kind: PartyKind;
  noun: string;
  title: string;
  base: string;
  permission: string;
  importKind: ImportKind;
  columns: readonly string[];
}

export const PARTIES: Record<PartyKind, PartyConfig> = {
  customer: {
    kind: 'customer',
    noun: 'customer',
    title: 'Customers',
    base: '/parties/customers',
    permission: 'parties.customer',
    importKind: 'customers',
    columns: CUSTOMER_CSV_COLUMNS,
  },
  supplier: {
    kind: 'supplier',
    noun: 'supplier',
    title: 'Suppliers',
    base: '/parties/suppliers',
    permission: 'parties.supplier',
    importKind: 'suppliers',
    columns: SUPPLIER_CSV_COLUMNS,
  },
};

export const CONTACT_FIELDS = [
  { key: 'contactPerson', label: 'Contact person', multiline: false },
  { key: 'phone', label: 'Phone', multiline: false },
  { key: 'email', label: 'Email', multiline: false },
  { key: 'address', label: 'Address', multiline: true },
  { key: 'taxId', label: 'Tax number', multiline: false },
  { key: 'notes', label: 'Notes', multiline: true },
] as const;
export type ContactKey = (typeof CONTACT_FIELDS)[number]['key'];

export const SCHEMAS = {
  customer: {
    dto: CustomerDto,
    page: CustomerPage,
    input: CustomerInput,
    update: CustomerUpdate,
  },
  supplier: {
    dto: SupplierDto,
    page: SupplierPage,
    input: SupplierInput,
    update: SupplierUpdate,
  },
} as const;

export function parseParty(kind: PartyKind, data: unknown): PartyDto {
  return SCHEMAS[kind].dto.parse(data);
}

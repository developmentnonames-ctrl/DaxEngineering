import { defineModule, type PermissionKeysOf } from '@dax/contracts';

export const partiesManifest = defineModule({
  key: 'parties',
  name: 'Customers & Suppliers',
  description: 'Shared directory of customers and suppliers.',
  dependsOn: [],
  features: {
    customer: {
      name: 'Customers',
      actions: {
        view: {},
        create: {},
        edit: {},
        archive: {},
        import: { label: 'Import from CSV' },
      },
    },
    supplier: {
      name: 'Suppliers',
      actions: {
        view: {},
        create: {},
        edit: {},
        archive: {},
        import: { label: 'Import from CSV' },
      },
    },
  },
  numberSeries: [
    { docType: 'CUS', name: 'Customer code', yearly: false },
    { docType: 'SUP', name: 'Supplier code', yearly: false },
  ],
  menu: [
    {
      key: 'parties.customers',
      label: 'Customers',
      path: '/parties/customers',
      permission: 'parties.customer.view',
      icon: 'users',
    },
    {
      key: 'parties.suppliers',
      label: 'Suppliers',
      path: '/parties/suppliers',
      permission: 'parties.supplier.view',
      icon: 'building',
    },
  ],
  defaultGrants: {
    stores_manager: { '*': 'ALL' },
    stores_keeper: {
      'customer.view': 'ALL',
      'customer.create': 'ALL',
      'supplier.view': 'ALL',
      'supplier.create': 'ALL',
    },
  },
});

export type PartiesPermission = PermissionKeysOf<typeof partiesManifest>;

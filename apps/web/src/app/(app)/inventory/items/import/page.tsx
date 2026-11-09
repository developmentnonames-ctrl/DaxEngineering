import { ITEM_CSV_COLUMNS } from '@dax/inventory-contract';
import { PageHead } from '@dax/web-shell';
import { ImportScreen } from '../../../../../components/import-screen';
import { requirePermission } from '../../../../../lib/server';

export default async function ImportItemsPage() {
  await requirePermission('inventory.item.import');
  return (
    <>
      <PageHead
        back={{ href: '/inventory/items', label: 'Items' }}
        eyebrow="Inventory"
        title="Import items"
        lede="Add or update many items at once from a CSV file."
      />
      <ImportScreen
        kind="items"
        noun="item"
        columns={ITEM_CSV_COLUMNS}
        backHref="/inventory/items"
        notes={[
          'Brands, machine models and bins must already exist; use the same names and codes as in the app.',
          'uom is a unit code such as PCS, SET, L or KG.',
          'Several machine models or barcodes go in one cell, separated as shown in the template.',
          'Save the file as CSV (UTF-8) from Excel or Google Sheets.',
        ]}
      />
    </>
  );
}

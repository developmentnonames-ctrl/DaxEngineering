import { Alert } from '@mantine/core';
import { PageHead, SectionCard } from '@dax/web-shell';
import { AppLink } from '../../../../../components/links';
import { requirePermission } from '../../../../../lib/server';
import { getCatalog } from '../../_lib/data';
import { ItemForm } from '../_item/item-form';

export default async function NewItemPage() {
  await requirePermission('inventory.item.create');
  const catalog = await getCatalog();
  return (
    <>
      <PageHead
        back={{ href: '/inventory/items', label: 'Items' }}
        eyebrow="Inventory"
        title="New item"
        lede="Part number, brand, unit and minimum stock. Add barcodes after saving."
      />
      {catalog.brands.length === 0 ? (
        <Alert color="orange">
          There are no brands yet. Add one under{' '}
          <AppLink href="/inventory/catalog">Brands and models</AppLink> first.
        </Alert>
      ) : null}
      <SectionCard title="Details">
        <ItemForm catalog={catalog} />
      </SectionCard>
    </>
  );
}

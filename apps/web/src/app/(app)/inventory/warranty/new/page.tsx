import { PageHead, SectionCard } from '@dax/web-shell';
import { requirePermission } from '../../../../../lib/server';
import { getCatalog } from '../../_lib/data';
import { BASE } from '../_lib/labels';
import { TagForm } from '../_lib/tag-form';

export default async function NewWarrantyTagPage() {
  await requirePermission('inventory.warranty.tag');
  const catalog = await getCatalog();
  const models = catalog.machineModels
    .filter((m) => m.active)
    .map((m) => ({ value: m.id, label: m.name }));
  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Warranty bin' }}
        eyebrow="Warranty bin"
        title="Tag a failed part"
        lede="Record the failed part and its fault, then put it in the warranty bin. A tag number is given when you save."
      />
      <SectionCard>
        <TagForm models={models} />
      </SectionCard>
    </>
  );
}

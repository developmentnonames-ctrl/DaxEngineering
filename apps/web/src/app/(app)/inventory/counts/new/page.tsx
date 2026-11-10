import { PageHead, SectionCard } from '@dax/web-shell';
import { requirePermission } from '../../../../../lib/server';
import { getCountScope } from '../_lib/data';
import { BASE } from '../_lib/labels';
import { CountForm } from './count-form';

export default async function NewCountPage() {
  await requirePermission('inventory.count.create');
  const scope = await getCountScope();

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Stock counts' }}
        eyebrow="Stock counts"
        title="New count"
        lede="Counting starts as soon as you create the count. The chosen bins are frozen: nothing can be put away into them or issued from them until the count is posted or cancelled."
      />
      <SectionCard>
        <CountForm zones={scope.zones} />
      </SectionCard>
    </>
  );
}

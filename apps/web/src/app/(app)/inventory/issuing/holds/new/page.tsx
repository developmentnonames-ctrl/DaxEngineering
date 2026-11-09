import { PageHead, SectionCard } from '@dax/web-shell';
import { requirePermission } from '../../../../../../lib/server';
import { getDepartments } from '../../_lib/data';
import { BASE } from '../../_lib/labels';
import { HoldForm } from './hold-form';

export default async function NewHoldPage() {
  await requirePermission('inventory.hold.create');
  const departments = await getDepartments();
  return (
    <>
      <PageHead
        back={{ href: `${BASE}/holds`, label: 'Holds' }}
        eyebrow="Issuing"
        title="New hold"
        lede="Keep free stock aside for a customer or job. A hold stays until it is released or turned into a request."
      />
      <SectionCard>
        <HoldForm departments={departments} />
      </SectionCard>
    </>
  );
}

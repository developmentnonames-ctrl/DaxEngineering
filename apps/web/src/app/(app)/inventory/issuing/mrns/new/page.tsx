import { canDo, PageHead, SectionCard } from '@dax/web-shell';
import { requirePermission } from '../../../../../../lib/server';
import { getDepartments } from '../../_lib/data';
import { BASE } from '../../_lib/labels';
import { MrnForm } from '../mrn-form';

export default async function NewMrnPage() {
  const caps = await requirePermission('inventory.mrn.create');
  const departments = await getDepartments();
  return (
    <>
      <PageHead
        back={{ href: `${BASE}/mrns`, label: 'Requests' }}
        eyebrow="Issuing"
        title="New request"
        lede="List the parts a job needs. Stores checks it, reserves what is free and the rest waits for stock."
      />
      <SectionCard>
        <MrnForm
          departments={departments}
          canSubmit={canDo(caps, 'inventory.mrn.create')}
        />
      </SectionCard>
    </>
  );
}

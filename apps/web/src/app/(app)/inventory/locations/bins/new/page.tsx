import { Alert } from '@mantine/core';
import { PageHead, SectionCard } from '@dax/web-shell';
import { requirePermission } from '../../../../../../lib/server';
import { getZones } from '../../../_lib/data';
import { BinCreate } from './bin-create';

export default async function NewBinsPage() {
  await requirePermission('inventory.location.manage');
  const zones = (await getZones())
    .filter((z) => z.active)
    .map(({ id, code, name }) => ({ id, code, name }));
  return (
    <>
      <PageHead
        back={{ href: '/inventory/locations', label: 'Bins and zones' }}
        eyebrow="Inventory"
        title="Add bins"
        lede="Bin codes read Zone-Rack-Shelf-Position. Rack and shelf numbers get a leading zero, so rack 1 shelf 2 position B in zone A is A-01-02-B."
      />
      {zones.length === 0 ? (
        <Alert color="orange">Add an active zone first.</Alert>
      ) : (
        <SectionCard>
          <BinCreate zones={zones} />
        </SectionCard>
      )}
    </>
  );
}

import { PageHead, SectionCard } from '@dax/web-shell';
import { requirePermission } from '../../../../../../lib/server';
import { BASE } from '../../_lib/labels';
import { WalkInForm } from './walk-in-form';

export default async function ReceiveDeliveryPage() {
  await requirePermission('inventory.grn.check');
  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Receiving' }}
        eyebrow="Receiving"
        title="Receive a delivery"
        lede="Start a draft GRN, then count each part at the dock."
      />
      <SectionCard title="Delivery">
        <WalkInForm />
      </SectionCard>
    </>
  );
}

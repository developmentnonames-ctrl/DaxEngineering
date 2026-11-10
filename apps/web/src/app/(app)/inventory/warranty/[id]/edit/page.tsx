import { redirect } from 'next/navigation';
import { Mono, PageHead, SectionCard } from '@dax/web-shell';
import { uuidParam } from '../../../../../../lib/load';
import { requirePermission } from '../../../../../../lib/server';
import { getCatalog } from '../../../_lib/data';
import { getWarranty } from '../../_lib/data';
import { tagPath } from '../../_lib/labels';
import { TagForm } from '../../_lib/tag-form';

export default async function EditWarrantyTagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('inventory.warranty.tag');
  const id = await uuidParam(params);
  const [tag, catalog] = await Promise.all([getWarranty(id), getCatalog()]);
  if (tag.status === 'CLOSED') redirect(tagPath(id));
  const models = catalog.machineModels
    .filter((m) => m.active || m.id === tag.machineModel?.id)
    .map((m) => ({ value: m.id, label: m.name }));
  if (
    tag.machineModel &&
    !models.some((m) => m.value === tag.machineModel?.id)
  ) {
    models.push({ value: tag.machineModel.id, label: tag.machineModel.name });
  }

  return (
    <>
      <PageHead
        back={{ href: tagPath(id), label: tag.number }}
        eyebrow="Warranty bin"
        title={
          <>
            Edit <Mono>{tag.number}</Mono>
          </>
        }
      />
      <SectionCard>
        <TagForm
          models={models}
          initial={{
            id: tag.id,
            version: tag.version,
            item: {
              value: tag.item.id,
              label: `${tag.item.partNo} (${tag.item.brand}) · ${tag.item.description}`,
            },
            itemLocked: tag.returnNote !== null,
            qty: tag.qty,
            serialNo: tag.serialNo ?? '',
            machineModelId: tag.machineModel?.id ?? null,
            machineSerial: tag.machineSerial ?? '',
            jobNumber: tag.jobNumber ?? '',
            customer:
              tag.customer === undefined
                ? undefined
                : tag.customer
                  ? { value: tag.customer.id, label: tag.customer.name }
                  : null,
            supplier: tag.supplier
              ? { value: tag.supplier.id, label: tag.supplier.name }
              : null,
            supplierRequired: tag.status === 'SENT',
            claimNumber: tag.claimNumber ?? '',
            fault: tag.fault,
          }}
        />
      </SectionCard>
    </>
  );
}

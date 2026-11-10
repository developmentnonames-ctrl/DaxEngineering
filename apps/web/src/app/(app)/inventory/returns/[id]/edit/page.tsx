import { notFound, redirect } from 'next/navigation';
import { canDo, Mono, PageHead, SectionCard } from '@dax/web-shell';
import { uuidParam } from '../../../../../../lib/load';
import { requirePermission } from '../../../../../../lib/server';
import { getDepartments } from '../../../issuing/_lib/data';
import { findReturnableAod, getReturn } from '../../_lib/data';
import { returnPath } from '../../_lib/labels';
import { type ReturnMode, ReturnForm } from '../../_lib/return-form';

export default async function EditReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.return_note.create');
  const id = await uuidParam(params);
  const note = await getReturn(id);
  if (note.status !== 'DRAFT') redirect(returnPath(id));

  let mode: ReturnMode;
  if (note.aod) {
    const aod = await findReturnableAod(note.aod.id);
    if (!aod) notFound();
    mode = { kind: 'aod', aod };
  } else {
    mode = { kind: 'free', departments: await getDepartments() };
  }

  return (
    <>
      <PageHead
        back={{ href: returnPath(id), label: 'Draft return' }}
        eyebrow={
          note.aod ? (
            <>
              Return against AOD <Mono>{note.aod.number ?? ''}</Mono>
            </>
          ) : (
            'Free return'
          )
        }
        title="Edit return"
        lede={[note.department.name, note.customer?.name, note.jobNumber]
          .filter(Boolean)
          .join(' · ')}
      />
      <SectionCard>
        <ReturnForm
          key={note.version}
          mode={mode}
          draft={note}
          canPost={canDo(caps, 'inventory.return_note.post')}
        />
      </SectionCard>
    </>
  );
}

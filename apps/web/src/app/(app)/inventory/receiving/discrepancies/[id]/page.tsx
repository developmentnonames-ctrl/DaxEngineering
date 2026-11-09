import Link from 'next/link';
import { canDo, Facts, Mono, PageHead, SectionCard } from '@dax/web-shell';
import { formatDateTime, formatQty } from '../../../../../../lib/format';
import { uuidParam } from '../../../../../../lib/load';
import { requirePermission } from '../../../../../../lib/server';
import {
  DISCREPANCY_ENTITY,
  getDiscrepancy,
  listPhotos,
} from '../../_lib/data';
import { BASE, DISCREPANCY_KIND, grnPath } from '../../_lib/labels';
import { DiscrepancyStatusPill, KindPill } from '../../_lib/pills';
import { CloseForm, NotesForm } from './discrepancy-forms';
import { Photos } from './photos';

const KIND_HELP = {
  SHORT: 'Less arrived than the delivery note shows.',
  EXCESS: 'More arrived than the delivery note shows. The extra is in stock.',
  DAMAGED: 'Arrived damaged. The quantity is in quarantine, not free stock.',
  WRONG_ITEM: 'A different part arrived from what was ordered.',
} as const;

export default async function DiscrepancyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.discrepancy.view');
  const id = await uuidParam(params);
  const [d, photos] = await Promise.all([getDiscrepancy(id), listPhotos(id)]);
  const open = d.status === 'OPEN';
  const canReport = open && canDo(caps, 'inventory.discrepancy.report');
  const canClose = open && canDo(caps, 'inventory.discrepancy.close');
  const canSeeGrn = canDo(caps, 'inventory.grn.view');

  return (
    <>
      <PageHead
        back={{ href: `${BASE}/discrepancies`, label: 'Discrepancies' }}
        eyebrow={
          <>
            {DISCREPANCY_KIND[d.kind].label} · Found{' '}
            {formatDateTime(d.createdAt)}
          </>
        }
        title={
          <>
            <Mono>{d.item.partNo}</Mono> · {formatQty(d.qty)} {d.item.uom}
          </>
        }
        lede={KIND_HELP[d.kind]}
      />
      <div className="dax-chips">
        <KindPill kind={d.kind} />
        <DiscrepancyStatusPill status={d.status} />
      </div>

      <SectionCard title="Details">
        <Facts
          items={[
            {
              label: 'Part',
              value: (
                <>
                  <Link
                    href={`/inventory/items/${d.item.id}`}
                    className="dax-link"
                  >
                    <Mono>{d.item.partNo}</Mono>
                  </Link>{' '}
                  {d.item.brand}
                  <span className="dax-sub">{d.item.description}</span>
                </>
              ),
            },
            {
              label: 'Quantity',
              value: `${formatQty(d.qty)} ${d.item.uom}`,
            },
            { label: 'Supplier', value: d.supplier.name },
            {
              label: 'GRN',
              value: canSeeGrn ? (
                <Link href={grnPath(d.grn.id)} className="dax-link">
                  <Mono>{d.grn.number ?? 'Draft'}</Mono>
                </Link>
              ) : (
                <Mono>{d.grn.number ?? 'Draft'}</Mono>
              ),
            },
            {
              label: 'Closed',
              value: d.closed
                ? `${d.closed.by ? `${d.closed.by} · ` : ''}${formatDateTime(d.closed.at)}`
                : '—',
            },
            ...(d.closeNote
              ? [
                  {
                    label: 'How it was settled',
                    value: (
                      <span style={{ whiteSpace: 'pre-wrap' }}>
                        {d.closeNote}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </SectionCard>

      <div className="dax-grid2">
        <SectionCard title="Notes">
          {canReport ? (
            <NotesForm
              key={d.version}
              id={d.id}
              version={d.version}
              notes={d.notes}
            />
          ) : (
            <span style={{ whiteSpace: 'pre-wrap' }}>{d.notes ?? '—'}</span>
          )}
        </SectionCard>
        <SectionCard title="Photos" note="Kept with the claim">
          <Photos
            entityKey={DISCREPANCY_ENTITY}
            discrepancyId={d.id}
            photos={photos.map((p) => ({
              id: p.id,
              fileName: p.fileName,
              createdAt: p.createdAt,
            }))}
            canUpload={canReport}
          />
        </SectionCard>
      </div>

      {canClose ? (
        <SectionCard title="Close" note="When the supplier has settled it">
          <CloseForm key={d.version} id={d.id} version={d.version} />
        </SectionCard>
      ) : null}
    </>
  );
}

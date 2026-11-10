import { Alert } from '@mantine/core';
import Link from 'next/link';
import { canDo, Facts, Mono, PageHead, SectionCard } from '@dax/web-shell';
import { LinkButton } from '../../../../../components/links';
import { formatDateTime, formatQty } from '../../../../../lib/format';
import { uuidParam } from '../../../../../lib/load';
import { requirePermission } from '../../../../../lib/server';
import { getWarranty, listPhotos } from '../_lib/data';
import {
  BASE,
  CUSTODY_NOTE,
  OUTCOME,
  returnPath,
  tagPath,
} from '../_lib/labels';
import { OutcomePill, WarrantyStatusPill } from '../_lib/pills';
import { Photos } from './photos';
import { CloseButton, SendButton } from './tag-buttons';

const STATUS_HELP = {
  TAGGED: 'In the warranty bin, waiting to go to the supplier.',
  SENT: 'With the supplier, waiting for their answer.',
  CLOSED: 'Settled. Nothing more to do.',
} as const;

function stamp(s: { by: string | null; at: string } | null): string {
  if (!s) return '—';
  return `${s.by ? `${s.by} · ` : ''}${formatDateTime(s.at)}`;
}

const or = (value: string | null) => value ?? '—';

export default async function WarrantyTagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.warranty.view');
  const id = await uuidParam(params);
  const [tag, photos] = await Promise.all([getWarranty(id), listPhotos(id)]);
  const can = (p: string) => canDo(caps, p);
  const open = tag.status !== 'CLOSED';
  const canTag = open && can('inventory.warranty.tag');

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Warranty bin' }}
        eyebrow={<>Warranty tag · Tagged {formatDateTime(tag.createdAt)}</>}
        title={<Mono>{tag.number}</Mono>}
        lede={STATUS_HELP[tag.status]}
        actions={
          open ? (
            <>
              {canTag ? (
                <LinkButton variant="default" href={`${tagPath(tag.id)}/edit`}>
                  Edit
                </LinkButton>
              ) : null}
              {tag.status === 'TAGGED' && can('inventory.warranty.send') ? (
                <SendButton
                  id={tag.id}
                  version={tag.version}
                  supplier={
                    tag.supplier
                      ? { value: tag.supplier.id, label: tag.supplier.name }
                      : null
                  }
                  claimNumber={tag.claimNumber}
                />
              ) : null}
              {can('inventory.warranty.close') ? (
                <CloseButton id={tag.id} version={tag.version} />
              ) : null}
            </>
          ) : null
        }
      />
      <div className="dax-chips">
        <WarrantyStatusPill status={tag.status} />
        <OutcomePill outcome={tag.outcome} />
      </div>
      {open ? (
        <Alert color="gray" variant="light">
          {CUSTODY_NOTE}
        </Alert>
      ) : null}

      <SectionCard title="Failed part">
        <Facts
          items={[
            {
              label: 'Part',
              value: (
                <>
                  <Link
                    href={`/inventory/items/${tag.item.id}`}
                    className="dax-link"
                  >
                    <Mono>{tag.item.partNo}</Mono>
                  </Link>{' '}
                  {tag.item.brand}
                  <span className="dax-sub">{tag.item.description}</span>
                </>
              ),
            },
            {
              label: 'Quantity',
              value: `${formatQty(tag.qty)} ${tag.item.uom}`,
            },
            {
              label: 'Part serial number',
              value: tag.serialNo ? <Mono>{tag.serialNo}</Mono> : '—',
            },
            {
              label: 'Fault',
              value: (
                <span style={{ whiteSpace: 'pre-wrap' }}>{tag.fault}</span>
              ),
            },
            { label: 'Kept in', value: <Mono>{tag.bin.code}</Mono> },
            { label: 'Tagged by', value: stamp(tag.created) },
          ]}
        />
      </SectionCard>

      <div className="dax-grid2">
        <SectionCard title="Machine and job">
          <Facts
            items={[
              { label: 'Machine model', value: tag.machineModel?.name ?? '—' },
              {
                label: 'Machine serial number',
                value: tag.machineSerial ? (
                  <Mono>{tag.machineSerial}</Mono>
                ) : (
                  '—'
                ),
              },
              { label: 'Job number', value: or(tag.jobNumber) },
              ...(tag.customer !== undefined
                ? [{ label: 'Customer', value: tag.customer?.name ?? '—' }]
                : []),
              ...(tag.returnNote
                ? [
                    {
                      label: 'Came back on return',
                      value: (
                        <Link
                          href={returnPath(tag.returnNote.id)}
                          className="dax-link"
                        >
                          <Mono>{tag.returnNote.number ?? 'Draft'}</Mono>
                        </Link>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </SectionCard>
        <SectionCard title="Claim">
          <Facts
            items={[
              { label: 'Supplier', value: tag.supplier?.name ?? '—' },
              {
                label: 'Supplier claim number',
                value: tag.claimNumber ? <Mono>{tag.claimNumber}</Mono> : '—',
              },
              { label: 'Sent', value: stamp(tag.sent) },
              {
                label: 'Outcome',
                value: tag.outcome ? OUTCOME[tag.outcome].label : '—',
              },
              { label: 'Closed', value: stamp(tag.closed) },
              ...(tag.closeNote
                ? [
                    {
                      label: 'Closing note',
                      value: (
                        <span style={{ whiteSpace: 'pre-wrap' }}>
                          {tag.closeNote}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Photos" note="Kept with the claim">
        <Photos
          tagId={tag.id}
          photos={photos.map((p) => ({
            id: p.id,
            fileName: p.fileName,
            createdAt: p.createdAt,
          }))}
          canEdit={canTag}
        />
      </SectionCard>
    </>
  );
}

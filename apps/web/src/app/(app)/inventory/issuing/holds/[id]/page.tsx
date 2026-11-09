import Link from 'next/link';
import {
  canDo,
  Facts,
  LinkList,
  Mono,
  PageHead,
  SectionCard,
} from '@dax/web-shell';
import { formatDateTime, formatQty } from '../../../../../../lib/format';
import { uuidParam } from '../../../../../../lib/load';
import { requirePermission } from '../../../../../../lib/server';
import { getHold } from '../../_lib/data';
import { BASE, mrnPath } from '../../_lib/labels';
import { HoldStatusPill } from '../../_lib/pills';
import { ConvertHoldButton, ReleaseHoldButton } from './hold-buttons';

export default async function HoldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.hold.view');
  const id = await uuidParam(params);
  const hold = await getHold(id);
  const can = (p: string) => canDo(caps, p);
  const active = hold.status === 'ACTIVE';

  return (
    <>
      <PageHead
        back={{ href: `${BASE}/holds`, label: 'Holds' }}
        eyebrow={<>Stock hold · Placed {formatDateTime(hold.createdAt)}</>}
        title={<Mono>{hold.number}</Mono>}
        lede={[hold.department.name, hold.customer?.name]
          .filter(Boolean)
          .join(' · ')}
        actions={
          active ? (
            <>
              {can('inventory.hold.release') ? (
                <ReleaseHoldButton id={hold.id} version={hold.version} />
              ) : null}
              {can('inventory.hold.convert') ? (
                <ConvertHoldButton id={hold.id} version={hold.version} />
              ) : null}
            </>
          ) : null
        }
      />
      <div className="dax-chips">
        <HoldStatusPill status={hold.status} />
      </div>
      <SectionCard title="Details">
        <Facts
          items={[
            { label: 'Department', value: hold.department.name },
            ...(hold.customer
              ? [{ label: 'Customer', value: hold.customer.name }]
              : []),
            {
              label: 'Reason',
              value: (
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {hold.reason ?? '—'}
                </span>
              ),
            },
            ...(hold.convertedMrn
              ? [
                  {
                    label: 'Turned into request',
                    value: (
                      <Link
                        href={mrnPath(hold.convertedMrn.id)}
                        className="dax-link"
                      >
                        <Mono>{hold.convertedMrn.number ?? 'Draft'}</Mono>
                      </Link>
                    ),
                  },
                ]
              : []),
            ...(hold.released
              ? [
                  {
                    label: 'Released',
                    value: `${hold.released.by ? `${hold.released.by} · ` : ''}${formatDateTime(hold.released.at)}`,
                  },
                ]
              : []),
          ]}
        />
      </SectionCard>
      <SectionCard title="Held parts">
        <LinkList
          items={hold.lines.map((l) => ({
            key: l.id,
            href: `/inventory/items/${l.item.id}`,
            title: (
              <>
                <Mono>{l.item.partNo}</Mono>{' '}
                <span className="dax-muted">{l.item.brand}</span>
              </>
            ),
            sub: l.item.description,
            aside: (
              <b>
                {formatQty(l.qty)} {l.item.uom}
              </b>
            ),
          }))}
        />
      </SectionCard>
    </>
  );
}

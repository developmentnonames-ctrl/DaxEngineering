import Link from 'next/link';
import {
  ActionTiles,
  type ActionTileItem,
  canDo,
  Chips,
  Empty,
  type Kpi,
  KpiTiles,
  LinkList,
  Mono,
  PageHead,
  SectionCard,
} from '@dax/web-shell';
import { formatDateTime } from '../../../../lib/format';
import { flatten, type SearchParams, toQuery } from '../../../../lib/query';
import { requirePermission } from '../../../../lib/server';
import { getIssuingSummary, listMrns } from './_lib/data';
import { BASE, MRN_SUBTYPE_LABELS, mrnPath } from './_lib/labels';
import { MrnStatusPill, WaitingPill } from './_lib/pills';

const count = new Intl.NumberFormat('en-LK');

const CHIPS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'SUBMITTED', label: 'To check' },
  { value: 'WAITING', label: 'Waiting for stock' },
  { value: 'READY', label: 'Ready to pick' },
  { value: 'ALL', label: 'All' },
];

export default async function IssuingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission(
    'inventory.mrn.view',
    'inventory.aod.view',
    'inventory.hold.view',
  );
  const can = (p: string) => canDo(caps, p);
  const query = flatten(await searchParams);
  const status = CHIPS.some((c) => c.value === query['status'])
    ? (query['status'] ?? 'OPEN')
    : 'OPEN';
  const canMrns = can('inventory.mrn.view');
  const canAods = can('inventory.aod.view');

  const [summary, mrns] = await Promise.all([
    getIssuingSummary(),
    canMrns ? listMrns({ status, limit: '10' }) : null,
  ]);

  const mrnLink = (s: string) =>
    canMrns ? `${BASE}/mrns?status=${s}` : undefined;
  const aodLink = (s: string) =>
    canAods ? `${BASE}/aods?status=${s}` : undefined;
  const kpis: Kpi[] = summary
    ? [
        {
          label: 'To check',
          value: count.format(summary.mrnToCheck),
          tone: 'int',
          href: mrnLink('SUBMITTED'),
        },
        {
          label: 'Waiting for stock',
          value: count.format(summary.mrnWaiting),
          tone: 'hi',
          href: mrnLink('WAITING'),
        },
        {
          label: 'Ready to pick',
          value: count.format(summary.mrnReady),
          tone: 'ok',
          href: mrnLink('READY'),
        },
        {
          label: 'Picking',
          value: count.format(summary.picking),
          href: aodLink('PICKING'),
        },
        {
          label: 'Awaiting signature',
          value: count.format(summary.awaitingSignature),
          tone: 'bad',
          href: aodLink('ISSUED'),
        },
      ]
    : [];

  const tiles: ActionTileItem[] = [];
  if (can('inventory.mrn.create'))
    tiles.push({
      href: `${BASE}/mrns/new`,
      title: 'New request',
      sub: 'Parts a job or department needs.',
      icon: 'plus',
      use: 'often',
    });
  if (can('inventory.aod.issue'))
    tiles.push({
      href: `${BASE}/mrns?status=READY`,
      title: 'Pick and issue',
      sub: summary
        ? `${count.format(summary.mrnReady)} ready. Pick parts and print the AOD.`
        : 'Pick reserved parts and print the AOD.',
      icon: 'send',
      use: 'often',
    });
  if (can('inventory.mrn.allocate'))
    tiles.push({
      href: `${BASE}/mrns?status=WAITING`,
      title: 'Waiting for stock',
      sub: summary
        ? `${count.format(summary.mrnWaiting)} requests waiting for stock.`
        : 'Assign newly arrived stock to waiting requests.',
      icon: 'history',
      use: 'often',
    });
  if (canAods)
    tiles.push({
      href: `${BASE}/aods?status=ISSUED`,
      title: 'Awaiting signature',
      sub: summary
        ? `${count.format(summary.awaitingSignature)} AODs need their signed copy.`
        : 'Upload signed copies to complete AODs.',
      icon: 'edit',
      use: 'often',
    });
  if (can('inventory.hold.view'))
    tiles.push({
      href: `${BASE}/holds`,
      title: 'Holds',
      sub: summary
        ? `${count.format(summary.activeHolds)} active. Stock kept aside.`
        : 'Stock kept aside for a customer or job.',
      icon: 'lock',
      use: 'sometimes',
    });

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Issuing"
        lede="Requests are checked and reserved, picked onto an AOD, issued, then completed with the signed copy."
      />
      {kpis.length ? <KpiTiles items={kpis} /> : null}
      {tiles.length ? (
        <SectionCard title="What would you like to do?">
          <ActionTiles items={tiles} />
        </SectionCard>
      ) : null}
      {mrns ? (
        <SectionCard
          title="Requests"
          note="Material requests (MRN)"
          actions={
            <Link className="dax-link" href={`${BASE}/mrns`}>
              See all
            </Link>
          }
          toolbar={
            <Chips
              items={CHIPS.map((c) => ({
                href: `${BASE}${toQuery({ status: c.value === 'OPEN' ? undefined : c.value })}`,
                label: c.label,
                active: c.value === status,
              }))}
            />
          }
        >
          {mrns.items.length ? (
            <LinkList
              items={mrns.items.map((m) => ({
                key: m.id,
                href: mrnPath(m.id),
                title: (
                  <>
                    <Mono>{m.number ?? 'Draft'}</Mono> · {m.department.name}
                    {m.customer ? ` · ${m.customer.name}` : ''}
                  </>
                ),
                sub: [
                  MRN_SUBTYPE_LABELS[m.subtype],
                  m.jobNumber ? `Job ${m.jobNumber}` : null,
                  `${m.lineCount} ${m.lineCount === 1 ? 'line' : 'lines'}`,
                  formatDateTime(m.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · '),
                aside: (
                  <span className="dax-chips" style={{ gap: 4 }}>
                    <WaitingPill count={m.waitingLines} />
                    <MrnStatusPill status={m.status} />
                  </span>
                ),
              }))}
            />
          ) : (
            <Empty title="No requests here">
              {status === 'OPEN'
                ? 'Nothing is open right now.'
                : 'Try another filter.'}
            </Empty>
          )}
        </SectionCard>
      ) : null}
    </>
  );
}

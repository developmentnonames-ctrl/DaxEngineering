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
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { formatDateTime } from '../../../../lib/format';
import { flatten, type SearchParams, toQuery } from '../../../../lib/query';
import { requirePermission } from '../../../../lib/server';
import { getReceivingSummary, listGrns } from './_lib/data';
import { BASE, grnPath } from './_lib/labels';
import { GrnStatusPill } from './_lib/pills';

const count = new Intl.NumberFormat('en-LK');

const GRN_CHIPS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CHECKED', label: 'Checked' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'ALL', label: 'All' },
];

function pick(value: string | undefined, options: { value: string }[]) {
  return options.some((o) => o.value === value) && value ? value : 'OPEN';
}

export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission(
    'inventory.grn.view',
    'inventory.discrepancy.view',
  );
  const can = (p: string) => canDo(caps, p);
  const query = flatten(await searchParams);
  const grnStatus = pick(query['grns'], GRN_CHIPS);
  const canGrns = can('inventory.grn.view');

  const [summary, grns] = await Promise.all([
    getReceivingSummary(),
    canGrns ? listGrns({ status: grnStatus, limit: '8' }) : null,
  ]);

  const kpis: Kpi[] = summary
    ? [
        {
          label: 'Drafts',
          value: count.format(summary.drafts),
          href: canGrns ? `${BASE}/grns?status=DRAFT` : undefined,
        },
        {
          label: 'Waiting for put-away',
          value: count.format(summary.awaitingPutaway),
          tone: 'hi',
          href: canGrns ? `${BASE}/putaway` : undefined,
        },
        {
          label: 'Open discrepancies',
          value: count.format(summary.openDiscrepancies),
          tone: 'bad',
          href: can('inventory.discrepancy.view')
            ? `${BASE}/discrepancies`
            : undefined,
        },
      ]
    : [];

  const tiles: ActionTileItem[] = [];
  if (can('inventory.grn.check'))
    tiles.push({
      href: `${BASE}/grns/new`,
      title: 'Receive a delivery',
      sub: 'Pick the supplier, then scan and count what came in.',
      icon: 'truck',
      tint: 'orange',
    });
  if (can('inventory.grn.putaway'))
    tiles.push({
      href: `${BASE}/putaway`,
      title: 'Put away',
      sub: 'Move received stock from the receiving bin to its shelf.',
      icon: 'box',
      tint: 'gray',
    });
  if (can('inventory.discrepancy.view'))
    tiles.push({
      href: `${BASE}/discrepancies`,
      title: 'Discrepancies',
      sub: 'Short, extra, damaged and wrong items for the supplier.',
      icon: 'alert',
      tint: 'red',
    });

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Receiving"
        lede="Check deliveries at the dock, post them into the receiving bin, then put the stock away."
      />
      {kpis.length ? <KpiTiles items={kpis} /> : null}
      {tiles.length ? (
        <SectionCard title="What would you like to do?">
          <ActionTiles items={tiles} />
        </SectionCard>
      ) : null}
      {grns ? (
        <SectionCard
          title="Goods received"
          note="GRNs at the dock and waiting for put-away"
          actions={
            <Link className="dax-link" href={`${BASE}/grns`}>
              See all
            </Link>
          }
          toolbar={
            <Chips
              items={GRN_CHIPS.map((c) => ({
                href: `${BASE}${toQuery({ grns: c.value === 'OPEN' ? undefined : c.value })}`,
                label: c.label,
                active: c.value === grnStatus,
              }))}
            />
          }
        >
          {grns.items.length ? (
            <LinkList
              items={grns.items.map((g) => ({
                key: g.id,
                href: grnPath(g.id),
                title: (
                  <>
                    <Mono>{g.number ?? 'Draft'}</Mono> · {g.supplier.name}
                  </>
                ),
                sub: `${g.lineCount} ${g.lineCount === 1 ? 'line' : 'lines'} · ${formatDateTime(g.postedAt ?? g.createdAt)}`,
                aside: (
                  <span className="dax-chips" style={{ gap: 4 }}>
                    {g.openDiscrepancies ? (
                      <Pill tone="bad">{g.openDiscrepancies} open</Pill>
                    ) : null}
                    <GrnStatusPill status={g.status} />
                  </span>
                ),
              }))}
            />
          ) : (
            <Empty title="No GRNs here">
              {grnStatus === 'OPEN'
                ? 'Nothing at the dock right now.'
                : 'Try another filter.'}
            </Empty>
          )}
        </SectionCard>
      ) : null}
    </>
  );
}

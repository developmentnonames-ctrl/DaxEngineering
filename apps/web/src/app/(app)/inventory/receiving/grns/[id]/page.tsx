import {
  Alert,
  Box,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import Link from 'next/link';
import type { GrnDto } from '@dax/inventory-contract';
import {
  canDo,
  Empty,
  Facts,
  LinkList,
  Mono,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { LinkButton } from '../../../../../../components/links';
import {
  formatDateTime,
  formatDay,
  formatQty,
} from '../../../../../../lib/format';
import { uuidParam } from '../../../../../../lib/load';
import { requirePermission } from '../../../../../../lib/server';
import { getGrn } from '../../_lib/data';
import {
  BASE,
  discrepancyPath,
  EDITABLE_GRN,
  SUBTYPE_LABELS,
} from '../../_lib/labels';
import { qtyNumber, summarize } from '../../_lib/lines';
import {
  GrnStatusPill,
  KindPill,
  DiscrepancyStatusPill,
} from '../../_lib/pills';
import {
  CancelDraftButton,
  PostGrnButton,
  ReverseGrnButton,
} from './grn-buttons';
import { GrnDock } from './grn-dock';

type GrnLine = GrnDto['lines'][number];

function stamp(s: { by: string | null; at: string } | null): string {
  if (!s) return '—';
  return s.by ? `${s.by} · ${formatDateTime(s.at)}` : formatDateTime(s.at);
}

function PutAwayProgress({ line }: { line: GrnLine }) {
  const good = qtyNumber(line.qtyGood);
  if (good === 0) return <span className="dax-muted">—</span>;
  const done = qtyNumber(line.qtyPutAway);
  const pct = Math.min(100, Math.round((done / good) * 100));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="dax-sub">
        Put away <b>{formatQty(line.qtyPutAway)}</b> of{' '}
        {formatQty(line.qtyGood)}
      </span>
      <div className="dax-progress" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function LineFlags({ line }: { line: GrnLine }) {
  const received = qtyNumber(line.qtyGood) + qtyNumber(line.qtyDamaged);
  const short =
    line.qtyExpected !== null && received < qtyNumber(line.qtyExpected);
  return (
    <span className="dax-chips" style={{ gap: 4 }}>
      {qtyNumber(line.qtyDamaged) > 0 ? (
        <Pill tone="bad">{formatQty(line.qtyDamaged)} damaged</Pill>
      ) : null}
      {line.wrongItem ? <Pill tone="ext">Wrong item</Pill> : null}
      {short ? <Pill tone="bad">Short</Pill> : null}
    </span>
  );
}

function PostedLines({ grn }: { grn: GrnDto }) {
  return (
    <>
      <Box visibleFrom="md">
        <Table>
          <TableThead>
            <TableTr>
              <TableTh>Part</TableTh>
              <TableTh ta="right">On note</TableTh>
              <TableTh ta="right">Good</TableTh>
              <TableTh ta="right">Damaged</TableTh>
              <TableTh>Put-away</TableTh>
              <TableTh />
            </TableTr>
          </TableThead>
          <TableTbody>
            {grn.lines.map((line) => (
              <TableTr key={line.id}>
                <TableTd>
                  <Link
                    href={`/inventory/items/${line.item.id}`}
                    className="dax-link"
                  >
                    <Mono>{line.item.partNo}</Mono>
                  </Link>
                  <span className="dax-sub">{line.item.description}</span>
                </TableTd>
                <TableTd className="dax-num">
                  {line.qtyExpected ? formatQty(line.qtyExpected) : '—'}
                </TableTd>
                <TableTd className="dax-num">
                  {formatQty(line.qtyGood)}{' '}
                  <span className="dax-muted">{line.item.uom}</span>
                </TableTd>
                <TableTd className="dax-num">
                  {formatQty(line.qtyDamaged)}
                </TableTd>
                <TableTd style={{ minWidth: 160 }}>
                  <PutAwayProgress line={line} />
                </TableTd>
                <TableTd>
                  <LineFlags line={line} />
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Box>
      <Box hiddenFrom="md" className="dax-rows">
        {grn.lines.map((line) => (
          <div key={line.id} className="dax-row">
            <div className="dax-row-main">
              <Link
                href={`/inventory/items/${line.item.id}`}
                className="dax-link"
                style={{ fontSize: 17 }}
              >
                <Mono>{line.item.partNo}</Mono>
              </Link>
              <span>{line.item.description}</span>
              <span className="dax-sub">
                {line.qtyExpected
                  ? `On note ${formatQty(line.qtyExpected)} · `
                  : ''}
                Good <b>{formatQty(line.qtyGood)}</b> · Damaged{' '}
                <b>{formatQty(line.qtyDamaged)}</b> {line.item.uom}
              </span>
              <PutAwayProgress line={line} />
              <LineFlags line={line} />
            </div>
          </div>
        ))}
      </Box>
    </>
  );
}

export default async function GrnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.grn.view');
  const id = await uuidParam(params);
  const grn = await getGrn(id);
  const can = (p: string) => canDo(caps, p);
  const editable = EDITABLE_GRN.includes(grn.status);
  const canEdit = editable && can('inventory.grn.check');
  const canPost = can('inventory.grn.post');
  const posted = grn.status === 'POSTED' || grn.status === 'PUT_AWAY';
  const waiting = grn.lines.filter((l) => qtyNumber(l.toPutAway) > 0).length;
  const title = grn.number ? <Mono>{grn.number}</Mono> : 'Draft GRN';

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Receiving' }}
        eyebrow={
          <>
            Goods received · {SUBTYPE_LABELS[grn.subtype]} · Started{' '}
            {formatDateTime(grn.createdAt)}
          </>
        }
        title={title}
        lede={grn.supplier.name}
        actions={
          <>
            {canEdit ? (
              <CancelDraftButton id={grn.id} version={grn.version} />
            ) : null}
            {posted && can('inventory.grn.reverse') ? (
              <ReverseGrnButton
                id={grn.id}
                version={grn.version}
                number={grn.number ?? 'this GRN'}
              />
            ) : null}
            {grn.status === 'POSTED' &&
            waiting > 0 &&
            can('inventory.grn.putaway') ? (
              <LinkButton href={`${BASE}/putaway?grn=${grn.id}`} size="md">
                Put away
              </LinkButton>
            ) : null}
            {!canEdit && grn.status === 'CHECKED' && canPost ? (
              <PostGrnButton
                id={grn.id}
                version={grn.version}
                summary={summarize(grn.lines)}
                size="md"
              />
            ) : null}
          </>
        }
      />
      <div className="dax-chips">
        <GrnStatusPill status={grn.status} />
        {grn.openDiscrepancies ? (
          <Pill tone="bad">{grn.openDiscrepancies} open discrepancies</Pill>
        ) : null}
      </div>

      {grn.status === 'REVERSED' && grn.reversed ? (
        <Alert color="red" title="Reversed">
          {stamp(grn.reversed)}
          {grn.reversed.reason ? ` · ${grn.reversed.reason}` : ''}
        </Alert>
      ) : null}

      {canEdit ? (
        <GrnDock key={grn.version} grn={grn} canPost={canPost} />
      ) : (
        <>
          <SectionCard title="Delivery">
            <Facts
              items={[
                {
                  label: 'GRN number',
                  value: grn.number ?? 'Given on posting',
                },
                { label: 'Type', value: SUBTYPE_LABELS[grn.subtype] },
                { label: 'Supplier', value: grn.supplier.name },
                { label: 'Delivery note', value: grn.deliveryNote ?? '—' },
                {
                  label: 'Date on the delivery note',
                  value: formatDay(grn.deliveryDate),
                },
                { label: 'Checked', value: stamp(grn.checked) },
                { label: 'Posted', value: stamp(grn.posted) },
                {
                  label: 'Notes',
                  value: (
                    <span style={{ whiteSpace: 'pre-wrap' }}>
                      {grn.notes ?? '—'}
                    </span>
                  ),
                },
              ]}
            />
          </SectionCard>

          <SectionCard
            flush
            title="Lines"
            note={
              posted
                ? waiting
                  ? `${waiting} ${waiting === 1 ? 'line' : 'lines'} still in the receiving bin`
                  : 'Everything is put away'
                : `${grn.lines.length} ${grn.lines.length === 1 ? 'line' : 'lines'}`
            }
          >
            {grn.lines.length ? (
              <PostedLines grn={grn} />
            ) : (
              <div className="dax-card-body">
                <Empty title="No lines" />
              </div>
            )}
          </SectionCard>
        </>
      )}

      {grn.discrepancies.length ? (
        <SectionCard
          title="Discrepancies"
          note="For the supplier claim"
          actions={
            can('inventory.discrepancy.view') ? (
              <Link
                className="dax-link"
                href={`${BASE}/discrepancies?status=ALL`}
              >
                All discrepancies
              </Link>
            ) : null
          }
        >
          <LinkList
            items={grn.discrepancies.map((d) => {
              const line = grn.lines.find((l) => l.item.id === d.itemId);
              return {
                key: d.id,
                href: can('inventory.discrepancy.view')
                  ? discrepancyPath(d.id)
                  : undefined,
                title: (
                  <>
                    <Mono>{line?.item.partNo ?? 'Part'}</Mono> ·{' '}
                    {formatQty(d.qty)} {line?.item.uom ?? ''}
                  </>
                ),
                sub: line?.item.description,
                aside: (
                  <span className="dax-chips" style={{ gap: 4 }}>
                    <KindPill kind={d.kind} />
                    <DiscrepancyStatusPill status={d.status} />
                  </span>
                ),
              };
            })}
          />
        </SectionCard>
      ) : null}
    </>
  );
}

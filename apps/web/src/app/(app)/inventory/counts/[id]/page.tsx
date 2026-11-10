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
import { Fragment } from 'react';
import type { CountDto, CountLineDto } from '@dax/inventory-contract';
import {
  canDo,
  Facts,
  Figures,
  Mono,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { ConfirmAction } from '../../../../../components/confirm-action';
import { formatDateTime, formatQty } from '../../../../../lib/format';
import { uuidParam } from '../../../../../lib/load';
import { requirePermission } from '../../../../../lib/server';
import { qtyNumber } from '../../receiving/_lib/lines';
import { countStep } from '../_lib/actions';
import { getCount } from '../_lib/data';
import { BASE, COUNT_KIND_LABELS } from '../_lib/labels';
import { BlindPill, CountKindPill, CountStatusPill } from '../_lib/pills';
import { CountReasonButton } from './count-buttons';
import { CountSheet } from './count-sheet';

function stamp(s: { by: string | null; at: string } | null): string {
  if (!s) return '—';
  return s.by ? `${s.by} · ${formatDateTime(s.at)}` : formatDateTime(s.at);
}

function Difference({ line }: { line: CountLineDto }) {
  if (line.difference === undefined) return null;
  if (line.difference === null) return <span className="dax-muted">—</span>;
  const n = qtyNumber(line.difference);
  if (n === 0) return <span className="dax-muted">0</span>;
  return (
    <Pill tone={n > 0 ? 'int' : 'bad'}>
      {n > 0 ? '+' : ''}
      {formatQty(line.difference)}
    </Pill>
  );
}

function Counted({ line }: { line: CountLineDto }) {
  return line.countedQty === null ? (
    <Pill tone="hi">Not counted</Pill>
  ) : (
    <>
      {formatQty(line.countedQty)}{' '}
      <span className="dax-muted">{line.item.uom}</span>
    </>
  );
}

function Review({ count }: { count: CountDto }) {
  const visible = count.systemVisible;
  return (
    <>
      <Box visibleFrom="md">
        <Table>
          <TableThead>
            <TableTr>
              <TableTh>Bin</TableTh>
              <TableTh>Part</TableTh>
              {visible ? <TableTh ta="right">System</TableTh> : null}
              <TableTh ta="right">Counted</TableTh>
              {visible ? <TableTh ta="right">Difference</TableTh> : null}
              <TableTh>Counted by</TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>
            {count.bins.map((bin) =>
              bin.lines.length === 0 ? (
                <TableTr key={bin.id}>
                  <TableTd>
                    <Mono>{bin.code}</Mono>
                  </TableTd>
                  <TableTd colSpan={visible ? 5 : 3}>
                    <span className="dax-muted">Empty</span>
                  </TableTd>
                </TableTr>
              ) : (
                <Fragment key={bin.id}>
                  {bin.lines.map((l, i) => (
                    <TableTr key={l.id}>
                      <TableTd>
                        {i === 0 ? <Mono>{bin.code}</Mono> : null}
                      </TableTd>
                      <TableTd>
                        <Mono>{l.item.partNo}</Mono>{' '}
                        <span className="dax-muted">{l.item.brand}</span>
                        <span className="dax-sub">{l.item.description}</span>
                        {l.added ? <Pill tone="ext">Found here</Pill> : null}
                      </TableTd>
                      {visible ? (
                        <TableTd className="dax-num">
                          {l.systemQty !== undefined
                            ? formatQty(l.systemQty)
                            : null}
                        </TableTd>
                      ) : null}
                      <TableTd className="dax-num">
                        <Counted line={l} />
                      </TableTd>
                      {visible ? (
                        <TableTd className="dax-num">
                          <Difference line={l} />
                        </TableTd>
                      ) : null}
                      <TableTd>
                        {l.counted ? (
                          <span className="dax-sub">{stamp(l.counted)}</span>
                        ) : (
                          <span className="dax-muted">—</span>
                        )}
                      </TableTd>
                    </TableTr>
                  ))}
                </Fragment>
              ),
            )}
          </TableTbody>
        </Table>
      </Box>
      <Box hiddenFrom="md" className="dax-rows">
        {count.bins.map((bin) => (
          <div key={bin.id} className="dax-row">
            <div className="dax-row-main">
              <span className="dax-zone">{bin.code}</span>
              {bin.lines.length === 0 ? (
                <span className="dax-muted">Empty</span>
              ) : null}
              {bin.lines.map((l) => (
                <span key={l.id}>
                  <Mono>{l.item.partNo}</Mono> · Counted <Counted line={l} />
                  {visible && l.systemQty !== undefined ? (
                    <>
                      {' '}
                      · System {formatQty(l.systemQty)} <Difference line={l} />
                    </>
                  ) : null}
                  {l.added ? (
                    <>
                      {' '}
                      <Pill tone="ext">Found here</Pill>
                    </>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </Box>
    </>
  );
}

function differenceFigures(count: CountDto) {
  const lines = count.bins.flatMap((b) => b.lines);
  const diffs = lines.map((l) => qtyNumber(l.difference ?? '0'));
  return [
    { label: 'Lines', value: lines.length },
    { label: 'Match', value: diffs.filter((d) => d === 0).length },
    { label: 'More found', value: diffs.filter((d) => d > 0).length },
    {
      label: 'Less found',
      value: diffs.filter((d) => d < 0).length,
      bad: diffs.some((d) => d < 0),
    },
  ];
}

export default async function CountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.count.view');
  const id = await uuidParam(params);
  const count = await getCount(id);
  const can = (p: string) => canDo(caps, p);
  const open = count.status === 'COUNTING' || count.status === 'SUBMITTED';
  const submitted = count.status === 'SUBMITTED';
  const counting = count.status === 'COUNTING' && can('inventory.count.count');
  const approver = submitted && can('inventory.count.approve');

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Stock counts' }}
        eyebrow={
          <>
            {COUNT_KIND_LABELS[count.kind]} count · Started{' '}
            {formatDateTime(count.createdAt)}
          </>
        }
        title={<Mono>{count.number}</Mono>}
        lede={`${count.countedLines} of ${count.lineCount} ${count.lineCount === 1 ? 'line' : 'lines'} counted in ${count.bins.length} ${count.bins.length === 1 ? 'bin' : 'bins'}`}
        actions={
          <>
            {open && can('inventory.count.cancel') ? (
              <CountReasonButton
                id={count.id}
                version={count.version}
                step="cancel"
              />
            ) : null}
            {approver ? (
              <CountReasonButton
                id={count.id}
                version={count.version}
                step="send-back"
              />
            ) : null}
            {approver && !count.tookPart ? (
              <ConfirmAction
                action={countStep}
                payload={{
                  id: count.id,
                  version: count.version,
                  step: 'approve',
                }}
                label="Approve and post"
                title="Approve this count?"
                message="Each difference is posted to stock now and the bins are free again. This can't be undone."
                confirmLabel="Approve and post"
              />
            ) : null}
          </>
        }
      />
      <div className="dax-chips">
        <CountStatusPill status={count.status} />
        <CountKindPill kind={count.kind} />
        <BlindPill blind={count.blind} />
      </div>

      {count.status === 'COUNTING' && count.sendBackReason && count.sentBack ? (
        <Alert color="orange" title="Sent back for a recount">
          {count.sendBackReason}
        </Alert>
      ) : null}
      {approver && count.tookPart ? (
        <Alert color="blue">
          You counted or submitted this count, so another Stores Manager must
          approve it.
        </Alert>
      ) : null}
      {count.blind && !count.systemVisible ? (
        <Alert color="yellow" title="Blind count">
          Count what is on the shelf. System quantities stay hidden until the
          count is posted.
        </Alert>
      ) : null}

      <SectionCard title="Details">
        <Facts
          items={[
            { label: 'Kind', value: `${COUNT_KIND_LABELS[count.kind]} count` },
            { label: 'Blind', value: count.blind ? 'Yes' : 'No' },
            {
              label: 'Started',
              value: stamp({ by: count.createdBy, at: count.createdAt }),
            },
            { label: 'Submitted', value: stamp(count.submitted) },
            ...(count.sentBack
              ? [
                  {
                    label: 'Sent back',
                    value: `${stamp(count.sentBack)}${count.sendBackReason ? ` · ${count.sendBackReason}` : ''}`,
                  },
                ]
              : []),
            ...(count.approved
              ? [{ label: 'Approved', value: stamp(count.approved) }]
              : []),
            ...(count.cancelled
              ? [
                  {
                    label: 'Cancelled',
                    value: `${stamp(count.cancelled)}${count.cancelReason ? ` · ${count.cancelReason}` : ''}`,
                  },
                ]
              : []),
            {
              label: 'Notes',
              value: (
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {count.notes ?? '—'}
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      {counting ? (
        <CountSheet count={count} canSubmit={can('inventory.count.submit')} />
      ) : null}

      {count.systemVisible && count.status !== 'COUNTING' ? (
        <SectionCard title="Differences">
          <Figures items={differenceFigures(count)} />
        </SectionCard>
      ) : null}

      {!counting || can('inventory.count.approve') ? (
        <SectionCard
          flush
          title={submitted || count.status === 'POSTED' ? 'Review' : 'Lines'}
          note={
            count.status === 'POSTED'
              ? 'Differences as posted to stock'
              : `${count.countedLines} of ${count.lineCount} counted`
          }
        >
          <Review count={count} />
        </SectionCard>
      ) : null}
    </>
  );
}

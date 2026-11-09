import {
  Box,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import Link from 'next/link';
import type { MrnDto, MrnLineDto } from '@dax/inventory-contract';
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
import { ConfirmAction } from '../../../../../../components/confirm-action';
import { LinkButton } from '../../../../../../components/links';
import { formatDateTime, formatQty } from '../../../../../../lib/format';
import { uuidParam } from '../../../../../../lib/load';
import { requirePermission } from '../../../../../../lib/server';
import { qtyNumber } from '../../../receiving/_lib/lines';
import { mrnStep } from '../../_lib/actions';
import { getDepartments, getMrn } from '../../_lib/data';
import {
  AOD_TYPE_LABELS,
  aodPath,
  BASE,
  holdPath,
  MRN_SUBTYPE_LABELS,
  PICKABLE_MRN,
} from '../../_lib/labels';
import { AodStatusPill, MrnStatusPill, WaitingPill } from '../../_lib/pills';
import { MrnForm } from '../mrn-form';
import {
  AllocateButton,
  ShortCloseButton,
  StartPickingButton,
} from './mrn-buttons';

function stamp(s: { by: string | null; at: string } | null): string {
  if (!s) return '—';
  return s.by ? `${s.by} · ${formatDateTime(s.at)}` : formatDateTime(s.at);
}

function Bins({ line }: { line: MrnLineDto }) {
  if (line.bins.length === 0) return <span className="dax-muted">—</span>;
  return (
    <span className="dax-chips" style={{ gap: 4 }}>
      {line.bins.map((b) => (
        <span key={b.id} className="dax-pill">
          <Mono>{b.code}</Mono> {formatQty(b.qty)}
        </span>
      ))}
    </span>
  );
}

function Qty({ value }: { value: string }) {
  return qtyNumber(value) === 0 ? (
    <span className="dax-muted">—</span>
  ) : (
    <>{formatQty(value)}</>
  );
}

function Lines({ mrn }: { mrn: MrnDto }) {
  return (
    <>
      <Box visibleFrom="md">
        <Table>
          <TableThead>
            <TableTr>
              <TableTh>Part</TableTh>
              <TableTh ta="right">Requested</TableTh>
              <TableTh ta="right">Reserved</TableTh>
              <TableTh ta="right">Issued</TableTh>
              <TableTh ta="right">Waiting</TableTh>
              <TableTh ta="right">Short-closed</TableTh>
              <TableTh ta="right">Free now</TableTh>
              <TableTh>Bins</TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>
            {mrn.lines.map((l) => (
              <TableTr key={l.id}>
                <TableTd>
                  <Link
                    href={`/inventory/items/${l.item.id}`}
                    className="dax-link"
                  >
                    <Mono>{l.item.partNo}</Mono>
                  </Link>
                  <span className="dax-sub">{l.item.description}</span>
                  {l.notes ? <span className="dax-sub">{l.notes}</span> : null}
                </TableTd>
                <TableTd className="dax-num">
                  {formatQty(l.qtyRequested)}{' '}
                  <span className="dax-muted">{l.item.uom}</span>
                </TableTd>
                <TableTd className="dax-num">
                  <Qty value={l.qtyReserved} />
                </TableTd>
                <TableTd className="dax-num">
                  <Qty value={l.qtyIssued} />
                </TableTd>
                <TableTd className="dax-num">
                  {qtyNumber(l.qtyWaiting) > 0 ? (
                    <Pill tone="hi">{formatQty(l.qtyWaiting)}</Pill>
                  ) : (
                    <span className="dax-muted">—</span>
                  )}
                </TableTd>
                <TableTd className="dax-num">
                  <Qty value={l.qtyShortClosed} />
                </TableTd>
                <TableTd className="dax-num">{formatQty(l.freeNow)}</TableTd>
                <TableTd>
                  <Bins line={l} />
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Box>
      <Box hiddenFrom="md" className="dax-rows">
        {mrn.lines.map((l) => (
          <div key={l.id} className="dax-row">
            <div className="dax-row-main">
              <Link
                href={`/inventory/items/${l.item.id}`}
                className="dax-link"
                style={{ fontSize: 17 }}
              >
                <Mono>{l.item.partNo}</Mono>
              </Link>
              <span>{l.item.description}</span>
              <span className="dax-sub">
                Requested <b>{formatQty(l.qtyRequested)}</b> · Reserved{' '}
                <b>{formatQty(l.qtyReserved)}</b> · Issued{' '}
                <b>{formatQty(l.qtyIssued)}</b> {l.item.uom}
              </span>
              <span className="dax-sub">
                Free now {formatQty(l.freeNow)}
                {qtyNumber(l.qtyShortClosed) > 0
                  ? ` · Short-closed ${formatQty(l.qtyShortClosed)}`
                  : ''}
              </span>
              {qtyNumber(l.qtyWaiting) > 0 ? (
                <span>
                  <Pill tone="hi">Waiting {formatQty(l.qtyWaiting)}</Pill>
                </span>
              ) : null}
              <Bins line={l} />
            </div>
          </div>
        ))}
      </Box>
    </>
  );
}

export default async function MrnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.mrn.view');
  const id = await uuidParam(params);
  const mrn = await getMrn(id);
  const can = (p: string) => canDo(caps, p);
  const draft = mrn.status === 'DRAFT';
  const canEdit = draft && can('inventory.mrn.create');
  const departments = canEdit ? await getDepartments() : [];
  const pickable = PICKABLE_MRN.includes(mrn.status);
  const reserved = mrn.lines.some((l) => qtyNumber(l.qtyReserved) > 0);
  const waiting = mrn.lines.some((l) => qtyNumber(l.qtyWaiting) > 0);
  const nothingIssued = mrn.lines.every((l) => qtyNumber(l.qtyIssued) === 0);
  const picking = mrn.aods.find((a) => a.status === 'PICKING');
  const cancellable =
    can('inventory.mrn.cancel') &&
    nothingIssued &&
    !picking &&
    (draft || mrn.status === 'SUBMITTED' || pickable);
  const who = [mrn.department.name, mrn.customer?.name]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <PageHead
        back={{ href: `${BASE}/mrns`, label: 'Requests' }}
        eyebrow={
          <>
            {MRN_SUBTYPE_LABELS[mrn.subtype]} request · Created{' '}
            {formatDateTime(mrn.createdAt)}
          </>
        }
        title={mrn.number ? <Mono>{mrn.number}</Mono> : 'Draft request'}
        lede={who}
        actions={
          <>
            {cancellable ? (
              <ConfirmAction
                action={mrnStep}
                payload={{ id: mrn.id, version: mrn.version, step: 'cancel' }}
                label="Cancel"
                title="Cancel this request?"
                message="Anything reserved for it becomes free again."
                confirmLabel="Cancel request"
                color="red"
              />
            ) : null}
            {pickable && waiting && can('inventory.mrn.short_close') ? (
              <ShortCloseButton mrn={mrn} />
            ) : null}
            {pickable && waiting && can('inventory.mrn.allocate') ? (
              <AllocateButton mrn={mrn} />
            ) : null}
            {mrn.status === 'SUBMITTED' && can('inventory.mrn.check') ? (
              <ConfirmAction
                action={mrnStep}
                payload={{ id: mrn.id, version: mrn.version, step: 'check' }}
                label="Check and reserve"
                title="Check this request?"
                message="Free stock is reserved for each line now. Anything not free waits until the Stores Manager assigns new stock."
                confirmLabel="Check and reserve"
              />
            ) : null}
            {picking && can('inventory.aod.view') ? (
              <LinkButton href={aodPath(picking.id)}>
                Continue picking
              </LinkButton>
            ) : pickable && reserved && can('inventory.aod.issue') ? (
              <StartPickingButton mrn={mrn} />
            ) : null}
          </>
        }
      />
      <div className="dax-chips">
        <MrnStatusPill status={mrn.status} />
        <WaitingPill count={mrn.waitingLines} />
      </div>

      <SectionCard title="Details">
        <Facts
          items={[
            { label: 'Type', value: MRN_SUBTYPE_LABELS[mrn.subtype] },
            { label: 'Department', value: mrn.department.name },
            ...(mrn.customer
              ? [{ label: 'Customer', value: mrn.customer.name }]
              : []),
            { label: 'Job number', value: mrn.jobNumber ?? '—' },
            { label: 'Customer PO', value: mrn.customerPo ?? '—' },
            { label: 'Quotation', value: mrn.quotationRef ?? '—' },
            ...(mrn.hold
              ? [
                  {
                    label: 'From hold',
                    value: can('inventory.hold.view') ? (
                      <Link href={holdPath(mrn.hold.id)} className="dax-link">
                        <Mono>{mrn.hold.number}</Mono>
                      </Link>
                    ) : (
                      <Mono>{mrn.hold.number}</Mono>
                    ),
                  },
                ]
              : []),
            { label: 'Submitted', value: stamp(mrn.submitted) },
            { label: 'Checked', value: stamp(mrn.checked) },
            ...(mrn.closed
              ? [
                  {
                    label: 'Closed',
                    value: `${stamp(mrn.closed)}${mrn.closeReason ? ` · ${mrn.closeReason}` : ''}`,
                  },
                ]
              : []),
            {
              label: 'Notes',
              value: (
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {mrn.notes ?? '—'}
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      {canEdit ? (
        <SectionCard title="Edit" note="Change it until you submit">
          <MrnForm
            key={mrn.version}
            mrn={mrn}
            departments={departments}
            canSubmit
          />
        </SectionCard>
      ) : (
        <SectionCard
          flush
          title="Parts"
          note={`${mrn.lines.length} ${mrn.lines.length === 1 ? 'line' : 'lines'}`}
        >
          <Lines mrn={mrn} />
        </SectionCard>
      )}

      <SectionCard title="Dispatch notes" note="AODs for this request">
        {mrn.aods.length ? (
          <LinkList
            items={mrn.aods.map((a) => ({
              key: a.id,
              href: can('inventory.aod.view') ? aodPath(a.id) : undefined,
              title: <Mono>{a.number ?? 'Picking'}</Mono>,
              sub: AOD_TYPE_LABELS[a.type],
              aside: <AodStatusPill status={a.status} />,
            }))}
          />
        ) : (
          <Empty title="Nothing issued yet" />
        )}
      </SectionCard>
    </>
  );
}

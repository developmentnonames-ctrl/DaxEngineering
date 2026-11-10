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
import type { ReturnDto, ReturnLineDto } from '@dax/inventory-contract';
import { canDo, Facts, Mono, PageHead, SectionCard } from '@dax/web-shell';
import { ConfirmAction } from '../../../../../components/confirm-action';
import { LinkButton } from '../../../../../components/links';
import { formatDateTime, formatQty } from '../../../../../lib/format';
import { uuidParam } from '../../../../../lib/load';
import { requirePermission } from '../../../../../lib/server';
import { returnStep } from '../_lib/actions';
import { getReturn } from '../_lib/data';
import { aodPath, BASE, editReturnPath, warrantyPath } from '../_lib/labels';
import { ConditionPill, ReturnStatusPill } from '../_lib/pills';

function stamp(s: { by: string | null; at: string } | null): string {
  if (!s) return '—';
  return s.by ? `${s.by} · ${formatDateTime(s.at)}` : formatDateTime(s.at);
}

function Destination({
  line,
  posted,
  seesWarranty,
}: {
  line: ReturnLineDto;
  posted: boolean;
  seesWarranty: boolean;
}) {
  if (line.condition === 'FAULTY') {
    if (!line.warrantyTag)
      return (
        <span className="dax-muted">
          {posted ? 'Warranty bin' : 'Warranty tag on posting'}
        </span>
      );
    return seesWarranty ? (
      <Link href={warrantyPath(line.warrantyTag.id)} className="dax-link">
        <Mono>{line.warrantyTag.number}</Mono>
      </Link>
    ) : (
      <Mono>{line.warrantyTag.number}</Mono>
    );
  }
  return line.bin ? <Mono>{line.bin.code}</Mono> : <>—</>;
}

function AodFigures({ line }: { line: ReturnLineDto }) {
  if (line.issued === null) return null;
  return (
    <span className="dax-sub">
      Issued {formatQty(line.issued)} · back on other returns{' '}
      {formatQty(line.returnedElsewhere ?? '0')}
    </span>
  );
}

function Details({ line }: { line: ReturnLineDto }) {
  const parts = [
    line.serialNo ? `Serial ${line.serialNo}` : null,
    line.notes,
  ].filter(Boolean);
  return parts.length ? (
    <span className="dax-sub" style={{ whiteSpace: 'pre-wrap' }}>
      {parts.join(' · ')}
    </span>
  ) : null;
}

function Lines({
  note,
  seesWarranty,
}: {
  note: ReturnDto;
  seesWarranty: boolean;
}) {
  const posted = note.status === 'POSTED';
  return (
    <>
      <Box visibleFrom="md">
        <Table>
          <TableThead>
            <TableTr>
              <TableTh>Part</TableTh>
              <TableTh ta="right">Quantity</TableTh>
              <TableTh>Condition</TableTh>
              <TableTh>Goes to</TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>
            {note.lines.map((l) => (
              <TableTr key={l.id}>
                <TableTd>
                  <Link
                    href={`/inventory/items/${l.item.id}`}
                    className="dax-link"
                  >
                    <Mono>{l.item.partNo}</Mono>
                  </Link>
                  <span className="dax-sub">{l.item.description}</span>
                  <AodFigures line={l} />
                  <Details line={l} />
                </TableTd>
                <TableTd className="dax-num">
                  {formatQty(l.qty)}{' '}
                  <span className="dax-muted">{l.item.uom}</span>
                </TableTd>
                <TableTd>
                  <ConditionPill condition={l.condition} />
                </TableTd>
                <TableTd>
                  <Destination
                    line={l}
                    posted={posted}
                    seesWarranty={seesWarranty}
                  />
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Box>
      <Box hiddenFrom="md" className="dax-rows">
        {note.lines.map((l) => (
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
                <b>
                  {formatQty(l.qty)} {l.item.uom}
                </b>{' '}
                to{' '}
                <Destination
                  line={l}
                  posted={posted}
                  seesWarranty={seesWarranty}
                />
              </span>
              <AodFigures line={l} />
              <Details line={l} />
              <span>
                <ConditionPill condition={l.condition} />
              </span>
            </div>
          </div>
        ))}
      </Box>
    </>
  );
}

export default async function ReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.return_note.view');
  const id = await uuidParam(params);
  const note = await getReturn(id);
  const can = (p: string) => canDo(caps, p);
  const draft = note.status === 'DRAFT';
  const canEdit = draft && can('inventory.return_note.create');
  const faulty = note.lines.some((l) => l.condition === 'FAULTY');

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Returns' }}
        eyebrow={
          <>
            {note.aod ? 'Return against an AOD' : 'Free return'} · Created{' '}
            {formatDateTime(note.createdAt)}
          </>
        }
        title={note.number ? <Mono>{note.number}</Mono> : 'Draft return'}
        lede={[note.department.name, note.customer?.name]
          .filter(Boolean)
          .join(' · ')}
        actions={
          draft ? (
            <>
              {canEdit ? (
                <ConfirmAction
                  action={returnStep}
                  payload={{
                    id: note.id,
                    version: note.version,
                    step: 'cancel',
                  }}
                  label="Cancel"
                  title="Cancel this return?"
                  message="Nothing has changed in stock. The draft is kept as cancelled."
                  confirmLabel="Cancel return"
                  color="red"
                />
              ) : null}
              {canEdit ? (
                <LinkButton href={editReturnPath(note.id)} variant="default">
                  Edit
                </LinkButton>
              ) : null}
              {can('inventory.return_note.post') ? (
                <ConfirmAction
                  action={returnStep}
                  payload={{ id: note.id, version: note.version, step: 'post' }}
                  label="Post return"
                  title="Post this return?"
                  message={
                    faulty
                      ? 'Good and damaged parts go into stock now and faulty parts are tagged for warranty. A posted return cannot be changed.'
                      : 'The parts go into stock now. A posted return cannot be changed.'
                  }
                  confirmLabel="Post return"
                />
              ) : null}
            </>
          ) : null
        }
      />
      <div className="dax-chips">
        <ReturnStatusPill status={note.status} />
      </div>

      <SectionCard title="Details">
        <Facts
          items={[
            {
              label: 'Return number',
              value: note.number ?? 'Given on posting',
            },
            {
              label: 'AOD',
              value: note.aod ? (
                can('inventory.aod.view') ? (
                  <Link href={aodPath(note.aod.id)} className="dax-link">
                    <Mono>{note.aod.number ?? 'AOD'}</Mono>
                  </Link>
                ) : (
                  <Mono>{note.aod.number ?? '—'}</Mono>
                )
              ) : (
                'None (free return)'
              ),
            },
            { label: 'Department', value: note.department.name },
            ...(note.customer
              ? [{ label: 'Customer', value: note.customer.name }]
              : []),
            { label: 'Job number', value: note.jobNumber ?? '—' },
            {
              label: 'Reason',
              value: (
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {note.reason ?? '—'}
                </span>
              ),
            },
            { label: 'Posted', value: stamp(note.posted) },
            {
              label: 'Notes',
              value: (
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {note.notes ?? '—'}
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        flush
        title="Parts"
        note={`${note.lines.length} ${note.lines.length === 1 ? 'line' : 'lines'}`}
      >
        <Lines note={note} seesWarranty={can('inventory.warranty.view')} />
      </SectionCard>
    </>
  );
}

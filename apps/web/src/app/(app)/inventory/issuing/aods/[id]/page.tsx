import {
  Box,
  Button,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import Link from 'next/link';
import type { AodDto } from '@dax/inventory-contract';
import {
  canDo,
  Facts,
  Icon,
  Mono,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { ConfirmAction } from '../../../../../../components/confirm-action';
import { formatDateTime, formatQty } from '../../../../../../lib/format';
import { uuidParam } from '../../../../../../lib/load';
import { requirePermission } from '../../../../../../lib/server';
import { aodStep } from '../../_lib/actions';
import { findMrn, getAod } from '../../_lib/data';
import { AOD_TYPE_LABELS, aodPdfPath, BASE, mrnPath } from '../../_lib/labels';
import { AodStatusPill } from '../../_lib/pills';
import { AodPicking, type BinStock } from './aod-picking';
import { SignUpload } from './sign-upload';

function stamp(s: { by: string | null; at: string } | null): string {
  if (!s) return '—';
  return s.by ? `${s.by} · ${formatDateTime(s.at)}` : formatDateTime(s.at);
}

function PrintButton({ id, primary }: { id: string; primary?: boolean }) {
  return (
    <Button
      component="a"
      href={aodPdfPath(id)}
      target="_blank"
      rel="noreferrer"
      size={primary ? 'lg' : 'sm'}
      variant={primary ? 'filled' : 'default'}
      leftSection={<Icon name="printer" size={20} />}
    >
      Print AOD
    </Button>
  );
}

function Lines({ aod }: { aod: AodDto }) {
  return (
    <>
      <Box visibleFrom="md">
        <Table>
          <TableThead>
            <TableTr>
              <TableTh>Part</TableTh>
              <TableTh>Bin</TableTh>
              <TableTh ta="right">Quantity</TableTh>
              <TableTh>Scanned</TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>
            {aod.lines.map((l) => (
              <TableTr key={l.id}>
                <TableTd>
                  <Mono>{l.item.partNo}</Mono>
                  <span className="dax-sub">{l.item.description}</span>
                </TableTd>
                <TableTd>{l.bin ? <Mono>{l.bin.code}</Mono> : '—'}</TableTd>
                <TableTd className="dax-num">
                  {formatQty(l.qty)}{' '}
                  <span className="dax-muted">{l.item.uom}</span>
                </TableTd>
                <TableTd>
                  {l.scanned ? <Pill tone="ok">Scanned</Pill> : '—'}
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Box>
      <Box hiddenFrom="md" className="dax-rows">
        {aod.lines.map((l) => (
          <div key={l.id} className="dax-row">
            <div className="dax-row-main">
              <b style={{ fontSize: 17 }}>
                <Mono>{l.item.partNo}</Mono>
              </b>
              <span>{l.item.description}</span>
              <span className="dax-sub">
                {formatQty(l.qty)} {l.item.uom} from{' '}
                {l.bin ? <Mono>{l.bin.code}</Mono> : 'no bin'}
                {l.scanned ? ' · scanned' : ''}
              </span>
            </div>
          </div>
        ))}
      </Box>
    </>
  );
}

export default async function AodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.aod.view');
  const id = await uuidParam(params);
  const aod = await getAod(id);
  const can = (p: string) => canDo(caps, p);
  const picking = aod.status === 'PICKING';
  const canPick = picking && can('inventory.aod.issue');
  const mrn = canPick ? await findMrn(aod.mrn.id) : null;
  const binsByLine: Record<string, BinStock[]> = Object.fromEntries(
    (mrn?.lines ?? []).map((l) => [l.id, l.bins]),
  );
  const printable = aod.status === 'ISSUED' || aod.status === 'SIGNED';
  const who = [aod.department.name, aod.customer?.name]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <PageHead
        back={{ href: `${BASE}/aods`, label: 'Dispatch notes' }}
        eyebrow={
          <>
            {AOD_TYPE_LABELS[aod.type]} dispatch · Started{' '}
            {formatDateTime(aod.createdAt)}
          </>
        }
        title={aod.number ? <Mono>{aod.number}</Mono> : 'Picking'}
        lede={who}
        actions={
          <>
            {picking && can('inventory.aod.cancel') ? (
              <ConfirmAction
                action={aodStep}
                payload={{ id: aod.id, version: aod.version, step: 'cancel' }}
                label="Cancel picking"
                title="Cancel this pick?"
                message="Nothing has left the store. The stock stays reserved for the request."
                confirmLabel="Cancel picking"
                color="red"
              />
            ) : null}
            {printable ? <PrintButton id={aod.id} /> : null}
          </>
        }
      />
      <div className="dax-chips">
        <AodStatusPill status={aod.status} />
      </div>

      {aod.status === 'ISSUED' ? (
        <section
          className="dax-card"
          style={{ background: 'var(--dax-bad-soft)' }}
          aria-labelledby="await-sign"
        >
          <div className="dax-stack" style={{ gap: 14 }}>
            <div>
              <div className="dax-eyebrow">Not complete yet</div>
              <h2
                id="await-sign"
                className="dax-h1"
                style={{ fontSize: 34, color: 'var(--dax-bad)' }}
              >
                Awaiting signature
              </h2>
              <p className="dax-lede">
                Print the AOD, have the receiver sign it, then upload the signed
                copy. Issued {stamp(aod.issued)}.
              </p>
            </div>
            <div>
              <PrintButton id={aod.id} primary />
            </div>
            {can('inventory.aod.attach_signed') ? (
              <SignUpload id={aod.id} version={aod.version} />
            ) : (
              <span className="dax-sub">
                Someone with permission to attach signed copies completes it.
              </span>
            )}
          </div>
        </section>
      ) : null}

      {aod.status === 'SIGNED' ? (
        <SectionCard title="Signed" note="Complete">
          <Facts
            items={[
              { label: 'Signed copy received', value: stamp(aod.signed) },
              {
                label: 'Signed copy',
                value: aod.signedFileId ? (
                  <a
                    href={`/files/${aod.signedFileId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="dax-link"
                  >
                    Open the signed copy
                  </a>
                ) : (
                  '—'
                ),
              },
            ]}
          />
        </SectionCard>
      ) : null}

      {canPick ? (
        <AodPicking key={aod.version} aod={aod} binsByLine={binsByLine} />
      ) : (
        <>
          <SectionCard title="Dispatch">
            <Facts
              items={[
                { label: 'AOD number', value: aod.number ?? 'Given on issue' },
                { label: 'Type', value: AOD_TYPE_LABELS[aod.type] },
                {
                  label: 'Request',
                  value: can('inventory.mrn.view') ? (
                    <Link href={mrnPath(aod.mrn.id)} className="dax-link">
                      <Mono>{aod.mrn.number ?? 'Request'}</Mono>
                    </Link>
                  ) : (
                    <Mono>{aod.mrn.number ?? '—'}</Mono>
                  ),
                },
                { label: 'Department', value: aod.department.name },
                ...(aod.customer
                  ? [{ label: 'Customer', value: aod.customer.name }]
                  : []),
                { label: 'Deliver to', value: aod.deliverTo ?? '—' },
                { label: 'Vehicle', value: aod.vehicleNo ?? '—' },
                { label: 'Issued', value: stamp(aod.issued) },
                {
                  label: 'Notes',
                  value: (
                    <span style={{ whiteSpace: 'pre-wrap' }}>
                      {aod.notes ?? '—'}
                    </span>
                  ),
                },
              ]}
            />
          </SectionCard>
          <SectionCard
            flush
            title="Parts"
            note={`${aod.lines.length} ${aod.lines.length === 1 ? 'pick' : 'picks'}`}
          >
            <Lines aod={aod} />
          </SectionCard>
        </>
      )}
    </>
  );
}

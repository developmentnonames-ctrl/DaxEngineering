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
import {
  canDo,
  CardBody,
  Empty,
  Facts,
  Mono,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { PrintLabelsButton } from '../../../../../../components/labels';
import { BIN_KIND_LABELS, formatQty } from '../../../../../../lib/format';
import { uuidParam } from '../../../../../../lib/load';
import { requirePermission } from '../../../../../../lib/server';
import { getBin } from '../../../_lib/data';
import { BinEdit } from './bin-edit';

export default async function BinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.location.view');
  const id = await uuidParam(params);
  const bin = await getBin(id);
  const canManage = canDo(caps, 'inventory.location.manage');
  const canPrint = canDo(caps, 'inventory.location.print_label');
  const canSeeItems = canDo(caps, 'inventory.item.view');
  const part = (row: (typeof bin.stock)[number]) =>
    canSeeItems ? (
      <Link href={`/inventory/items/${row.itemId}`} className="dax-link">
        <Mono>{row.partNo}</Mono>
      </Link>
    ) : (
      <b>
        <Mono>{row.partNo}</Mono>
      </b>
    );

  return (
    <>
      <PageHead
        back={{ href: '/inventory/locations', label: 'Bins and zones' }}
        eyebrow={`Bin · zone ${bin.zone.code}`}
        title={<Mono>{bin.code}</Mono>}
        actions={
          canPrint ? <PrintLabelsButton kind="bin" ids={[bin.id]} /> : null
        }
      />
      <div className="dax-chips">
        <Pill tone={bin.kind === 'STORAGE' ? 'int' : 'ext'}>
          {BIN_KIND_LABELS[bin.kind]}
        </Pill>
        {bin.active ? <Pill tone="ok">Active</Pill> : <Pill>Off</Pill>}
      </div>

      <SectionCard
        flush
        title="Stock in this bin"
        note={`${bin.stock.length} ${bin.stock.length === 1 ? 'part' : 'parts'}`}
      >
        {bin.stock.length === 0 ? (
          <CardBody>
            <Empty title="This bin is empty" />
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="sm">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>Part number</TableTh>
                    <TableTh>Brand</TableTh>
                    <TableTh>Description</TableTh>
                    <TableTh ta="right">Quantity</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {bin.stock.map((row) => (
                    <TableTr key={row.itemId}>
                      <TableTd>{part(row)}</TableTd>
                      <TableTd>{row.brand}</TableTd>
                      <TableTd>{row.description}</TableTd>
                      <TableTd className="dax-num">
                        <b>{formatQty(row.qty)}</b>{' '}
                        <span className="dax-muted">{row.uom}</span>
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="sm" className="dax-rows">
              {bin.stock.map((row) => (
                <div key={row.itemId} className="dax-row">
                  <div className="dax-row-main">
                    {part(row)}
                    <span className="dax-sub">
                      {row.brand} · {row.description}
                    </span>
                  </div>
                  <span className="dax-num">
                    <b>{formatQty(row.qty)}</b>{' '}
                    <span className="dax-muted">{row.uom}</span>
                  </span>
                </div>
              ))}
            </Box>
          </>
        )}
      </SectionCard>

      <div className="dax-grid2">
        <SectionCard title="Where it is">
          <Facts
            items={[
              { label: 'Zone', value: <Mono>{bin.zone.code}</Mono> },
              { label: 'Rack', value: <Mono>{bin.rack}</Mono> },
              { label: 'Shelf', value: <Mono>{bin.shelf}</Mono> },
              { label: 'Position', value: <Mono>{bin.position}</Mono> },
            ]}
          />
        </SectionCard>
        <SectionCard title="Settings">
          {canManage ? (
            <BinEdit key={bin.version} bin={bin} />
          ) : (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {bin.notes ?? 'No notes.'}
            </p>
          )}
        </SectionCard>
      </div>
    </>
  );
}

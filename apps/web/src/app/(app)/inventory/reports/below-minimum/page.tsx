import {
  Box,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import { canDo, CardBody, Empty, PageHead, SectionCard } from '@dax/web-shell';
import { formatQty } from '../../../../../lib/format';
import { requirePermission } from '../../../../../lib/server';
import { ExportButton } from '../_lib/buttons';
import { PartNo, TruncatedNote } from '../_lib/cells';
import { getBelowMin } from '../_lib/data';
import { BASE, exportHref } from '../_lib/reports';

export default async function BelowMinimumPage() {
  const caps = await requirePermission('inventory.stock.view');
  const report = await getBelowMin();
  const linked = canDo(caps, 'inventory.item.view');
  const canExport = canDo(caps, 'inventory.stock.export');

  return (
    <>
      <PageHead
        eyebrow="Reports"
        title="Below minimum"
        back={{ href: BASE, label: 'Reports' }}
        lede="Active parts whose free stock is under the minimum, most short first. Waiting is what open requests still need beyond what is already set aside for them."
        actions={
          canExport && report.items.length ? (
            <ExportButton href={exportHref('below-minimum')} />
          ) : null
        }
      />
      <TruncatedNote truncated={report.truncated} canExport={canExport} />
      <SectionCard
        flush
        title="Reorder list"
        note={`${report.items.length}${report.truncated ? '+' : ''} ${report.items.length === 1 ? 'part' : 'parts'}`}
      >
        {report.items.length === 0 ? (
          <CardBody>
            <Empty title="Nothing below minimum">
              Every part with a minimum has enough free stock.
            </Empty>
          </CardBody>
        ) : (
          <>
            <Box visibleFrom="md">
              <Table>
                <TableThead>
                  <TableTr>
                    <TableTh>Part number</TableTh>
                    <TableTh>Brand</TableTh>
                    <TableTh>Description</TableTh>
                    <TableTh>Unit</TableTh>
                    <TableTh ta="right">Minimum</TableTh>
                    <TableTh ta="right">On hand</TableTh>
                    <TableTh ta="right">Held</TableTh>
                    <TableTh ta="right">Free</TableTh>
                    <TableTh ta="right">Short by</TableTh>
                    <TableTh ta="right">Waiting on requests</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {report.items.map((row) => (
                    <TableTr key={row.item.id}>
                      <TableTd>
                        <PartNo item={row.item} linked={linked} />
                      </TableTd>
                      <TableTd>{row.item.brand}</TableTd>
                      <TableTd>{row.item.description}</TableTd>
                      <TableTd>{row.item.uom}</TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.minQty)}
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.onHand)}
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.held)}
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.free)}
                      </TableTd>
                      <TableTd className="dax-num">
                        <b>{formatQty(row.shortBy)}</b>
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.waiting)}
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {report.items.map((row) => (
                <div key={row.item.id} className="dax-row">
                  <div className="dax-row-main">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 17 }}>
                        <PartNo item={row.item} linked={linked} />
                      </span>
                      <b>
                        Short {formatQty(row.shortBy)} {row.item.uom}
                      </b>
                    </div>
                    <span>{row.item.description}</span>
                    <span className="dax-sub">
                      {row.item.brand} · Minimum {formatQty(row.minQty)} · Free{' '}
                      {formatQty(row.free)} · On hand {formatQty(row.onHand)} ·
                      Held {formatQty(row.held)}
                    </span>
                    {Number(row.waiting) > 0 ? (
                      <span className="dax-sub">
                        Waiting on requests {formatQty(row.waiting)}{' '}
                        {row.item.uom}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </Box>
          </>
        )}
      </SectionCard>
    </>
  );
}

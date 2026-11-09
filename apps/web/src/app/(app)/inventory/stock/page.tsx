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
import type { StockRow } from '@dax/inventory-contract';
import {
  canDo,
  CardBody,
  Empty,
  Mono,
  PageHead,
  SectionCard,
} from '@dax/web-shell';
import { ListFilters } from '../../../../components/list-filters';
import { Pager } from '../../../../components/pager';
import { BelowMinBadge, StockLine } from '../../../../components/stock';
import { formatQty } from '../../../../lib/format';
import { flatten, type SearchParams } from '../../../../lib/query';
import { requirePermission } from '../../../../lib/server';
import { getZones, listStock } from '../_lib/data';

function Bins({ row }: { row: StockRow }) {
  if (row.bins.length === 0) return <span className="dax-muted">—</span>;
  return (
    <div className="dax-chips" style={{ gap: 4 }}>
      {row.bins.map((b) => (
        <span key={b.code} className="dax-pill">
          <Mono>{b.code}</Mono> {formatQty(b.qty)}
        </span>
      ))}
    </div>
  );
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.stock.view');
  const query = flatten(await searchParams);
  const [zones, page] = await Promise.all([getZones(), listStock(query)]);
  const canSeeItems = canDo(caps, 'inventory.item.view');
  const part = (row: StockRow) =>
    canSeeItems ? (
      <Link href={`/inventory/items/${row.item.id}`} className="dax-link">
        <Mono>{row.item.partNo}</Mono>
      </Link>
    ) : (
      <b>
        <Mono>{row.item.partNo}</Mono>
      </b>
    );
  const filtered = Boolean(
    query['q'] || query['inStock'] || query['belowMin'] || query['zoneId'],
  );

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Stock"
        lede="Free is what can be issued now. Stock in the receiving bin becomes free after put-away; quarantine never does."
      />
      <SectionCard
        flush
        title="Stock on hand"
        note={`${page.items.length}${page.nextCursor ? '+' : ''} shown`}
        toolbar={
          <ListFilters
            searchPlaceholder="Part number or description"
            selects={[
              {
                name: 'zoneId',
                label: 'Zone',
                data: zones.map((z) => ({
                  value: z.id,
                  label: `${z.code} · ${z.name}`,
                })),
              },
            ]}
            toggles={[
              { name: 'inStock', label: 'In stock' },
              { name: 'belowMin', label: 'Below minimum' },
            ]}
          />
        }
      >
        {page.items.length === 0 ? (
          <CardBody>
            <Empty title="Nothing to show">
              {filtered
                ? 'Try a different search or filter.'
                : 'Stock appears here once goods are received.'}
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
                    <TableTh ta="right">On hand</TableTh>
                    <TableTh ta="right">Held</TableTh>
                    <TableTh ta="right">Free</TableTh>
                    <TableTh ta="right">In receiving</TableTh>
                    <TableTh ta="right">Minimum</TableTh>
                    <TableTh>Bins</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {page.items.map((row) => (
                    <TableTr key={row.item.id}>
                      <TableTd>{part(row)}</TableTd>
                      <TableTd>{row.item.brand}</TableTd>
                      <TableTd>{row.item.description}</TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.stock.onHand)}
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.stock.held)}
                      </TableTd>
                      <TableTd className="dax-num">
                        <b>{formatQty(row.stock.free)}</b>{' '}
                        <span className="dax-muted">{row.item.uom}</span>
                      </TableTd>
                      <TableTd className="dax-num">
                        {formatQty(row.stock.receiving)}
                      </TableTd>
                      <TableTd className="dax-num">
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 4,
                          }}
                        >
                          {formatQty(row.minQty)}
                          <BelowMinBadge belowMin={row.belowMin} />
                        </div>
                      </TableTd>
                      <TableTd>
                        <Bins row={row} />
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            </Box>
            <Box hiddenFrom="md" className="dax-rows">
              {page.items.map((row) => (
                <div key={row.item.id} className="dax-row">
                  <div className="dax-row-main">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 17 }}>{part(row)}</span>
                      <span className="dax-sub">{row.item.brand}</span>
                    </div>
                    <span>{row.item.description}</span>
                    <StockLine stock={row.stock} />
                    <span className="dax-sub">
                      Minimum {formatQty(row.minQty)} {row.item.uom}
                    </span>
                    <div className="dax-chips" style={{ gap: 4 }}>
                      <BelowMinBadge belowMin={row.belowMin} />
                    </div>
                    <Bins row={row} />
                  </div>
                </div>
              ))}
            </Box>
          </>
        )}
      </SectionCard>
      <Pager
        path="/inventory/stock"
        query={query}
        nextCursor={page.nextCursor}
      />
    </>
  );
}

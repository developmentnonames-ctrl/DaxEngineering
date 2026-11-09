import {
  Alert,
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
  Empty,
  Facts,
  Mono,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { ConfirmAction } from '../../../../../components/confirm-action';
import { PrintLabelsButton } from '../../../../../components/labels';
import { AppLink } from '../../../../../components/links';
import { BelowMinBadge, StockPanel } from '../../../../../components/stock';
import { formatDateTime, formatQty, uomLabel } from '../../../../../lib/format';
import { uuidParam } from '../../../../../lib/load';
import { requirePermission } from '../../../../../lib/server';
import { getCatalog, getItem } from '../../_lib/data';
import { setItemStatus } from '../_item/actions';
import { Barcodes } from '../_item/barcodes';
import { ItemForm } from '../_item/item-form';
import { Replacement } from '../_item/replacement';

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await requirePermission('inventory.item.view');
  const id = await uuidParam(params);
  const item = await getItem(id);
  const active = item.status === 'ACTIVE';
  const canEdit = canDo(caps, 'inventory.item.edit') && active;
  const canArchive = canDo(caps, 'inventory.item.archive');
  const canPrint = canDo(caps, 'inventory.item.print_label');
  const catalog = canEdit ? await getCatalog() : null;
  const replacement = item.latestReplacement ?? item.supersededBy;

  return (
    <>
      <PageHead
        back={{ href: '/inventory/items', label: 'Items' }}
        eyebrow={
          <>
            {item.brand.name} · Added {formatDateTime(item.createdAt)} · Updated{' '}
            {formatDateTime(item.updatedAt)}
          </>
        }
        title={<Mono>{item.partNo}</Mono>}
        lede={item.description}
        actions={
          <>
            {canPrint ? (
              <PrintLabelsButton kind="item" ids={[item.id]} />
            ) : null}
            {canArchive ? (
              <ConfirmAction
                action={setItemStatus}
                payload={{
                  id: item.id,
                  version: item.version,
                  status: active ? 'ARCHIVED' : 'ACTIVE',
                }}
                label={active ? 'Archive' : 'Restore'}
                title={
                  active ? `Archive ${item.partNo}?` : `Restore ${item.partNo}?`
                }
                message={
                  active
                    ? 'Archived items are hidden from pickers and new documents. Stock and history stay visible.'
                    : 'The item can be used in new documents again.'
                }
                color={active ? 'red' : undefined}
              />
            ) : null}
          </>
        }
      />
      {!active || item.belowMin || item.supersededBy ? (
        <div className="dax-chips">
          {!active ? <Pill>Archived</Pill> : <Pill tone="ok">Active</Pill>}
          {item.supersededBy ? <Pill tone="yel">Replaced</Pill> : null}
          <BelowMinBadge belowMin={item.belowMin} />
        </div>
      ) : null}

      {replacement ? (
        <Alert color="yellow" title="This part has been replaced">
          Replaced by{' '}
          <AppLink href={`/inventory/items/${replacement.id}`} fw={700}>
            <Mono>{replacement.partNo}</Mono> ({replacement.brand})
          </AppLink>
          . Use the new part where you can. Stock of this part is still shown
          below.
        </Alert>
      ) : null}

      <SectionCard title="Stock" note="Main store">
        <div className="dax-stack" style={{ gap: 16 }}>
          <StockPanel
            stock={item.stock}
            minQty={item.minQty}
            uom={item.uom}
            belowMin={item.belowMin}
          />
          {item.stockByBin.length ? (
            <Table>
              <TableThead>
                <TableTr>
                  <TableTh>Bin</TableTh>
                  <TableTh ta="right">Quantity</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {item.stockByBin.map((row) => (
                  <TableTr key={row.binId}>
                    <TableTd>
                      <Link
                        href={`/inventory/locations/bins/${row.binId}`}
                        className="dax-link"
                      >
                        <Mono>{row.binCode}</Mono>
                      </Link>
                    </TableTd>
                    <TableTd className="dax-num">
                      {formatQty(row.qty)} {item.uom}
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          ) : (
            <Empty title="Not in any bin yet" />
          )}
        </div>
      </SectionCard>

      <SectionCard title="Details">
        {canEdit && catalog ? (
          <ItemForm key={item.version} catalog={catalog} item={item} />
        ) : (
          <Facts
            items={[
              { label: 'Brand', value: item.brand.name },
              {
                label: 'Unit',
                value: `${uomLabel(item.uom)} (${item.uom})`,
              },
              { label: 'Minimum stock', value: formatQty(item.minQty) },
              {
                label: 'Usual bin',
                value: item.defaultBin ? (
                  <Link
                    href={`/inventory/locations/bins/${item.defaultBin.id}`}
                    className="dax-link"
                  >
                    <Mono>{item.defaultBin.code}</Mono>
                  </Link>
                ) : (
                  '—'
                ),
              },
              {
                label: 'Fits machine models',
                value: item.machineModels.map((m) => m.name).join(', ') || '—',
              },
              {
                label: 'Notes',
                value: (
                  <span style={{ whiteSpace: 'pre-wrap' }}>
                    {item.notes ?? '—'}
                  </span>
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      <div className="dax-grid2">
        <SectionCard
          title="Barcodes"
          note="A scan of any of these finds the item"
        >
          <Barcodes item={item} canEdit={canEdit} />
        </SectionCard>
        <SectionCard title="Replacement">
          <Replacement item={item} canEdit={canEdit} />
        </SectionCard>
      </div>
    </>
  );
}

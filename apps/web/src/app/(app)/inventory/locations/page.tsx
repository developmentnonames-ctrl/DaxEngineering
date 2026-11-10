import {
  Box,
  Table,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import Link from 'next/link';
import type { BinDto } from '@dax/inventory-contract';
import {
  canDo,
  CardBody,
  Empty,
  Mono,
  PageHead,
  Pager,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import {
  LabelSelection,
  SelectAllCheckbox,
  SelectCheckbox,
  SelectionHint,
} from '../../../../components/labels';
import { LinkButton } from '../../../../components/links';
import { ListFilters } from '../../../../components/list-filters';
import {
  BIN_KIND_LABELS,
  BIN_KIND_OPTIONS,
  formatCount,
} from '../../../../lib/format';
import { flatten, type SearchParams } from '../../../../lib/query';
import { requirePermission } from '../../../../lib/server';
import { getZones, listBins } from '../_lib/data';
import { type ZoneHead, ZoneSection, ZoneTbody } from './zone-groups';
import { AddZoneForm, ZoneList } from './zones';

function BinBadges({ bin }: { bin: BinDto }) {
  return (
    <div className="dax-chips" style={{ gap: 4 }}>
      {bin.kind !== 'STORAGE' ? (
        <Pill tone="ext">{BIN_KIND_LABELS[bin.kind]}</Pill>
      ) : null}
      {bin.active ? null : <Pill>Off</Pill>}
    </div>
  );
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission('inventory.location.view');
  const query = flatten(await searchParams);
  const [zones, page] = await Promise.all([getZones(), listBins(query)]);
  const canManage = canDo(caps, 'inventory.location.manage');
  const canPrint = canDo(caps, 'inventory.location.print_label');
  const ids = page.items.map((b) => b.id);
  const bins = (b: BinDto) => `/inventory/locations/bins/${b.id}`;
  // Bins come sorted by code, and a code starts with its zone, so each
  // zone's bins on this page are next to each other.
  const groups: { zone: ZoneHead; bins: BinDto[] }[] = [];
  for (const bin of page.items) {
    let group = groups.find((g) => g.zone.id === bin.zone.id);
    if (!group) {
      const zone = zones.find((z) => z.id === bin.zone.id);
      group = {
        zone: {
          id: bin.zone.id,
          code: bin.zone.code,
          name: bin.zone.name,
          binCount: zone?.binCount ?? 0,
          ids: [],
        },
        bins: [],
      };
      groups.push(group);
    }
    group.bins.push(bin);
    group.zone.ids.push(bin.id);
  }

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Bins and zones"
        lede="Bin codes read Zone-Rack-Shelf-Position, for example A-01-02-B."
        actions={
          canManage && zones.length ? (
            <LinkButton href="/inventory/locations/bins/new">
              Add bins
            </LinkButton>
          ) : null
        }
      />
      <SectionCard
        title="Zones"
        note={`${zones.length} ${zones.length === 1 ? 'zone' : 'zones'}`}
      >
        <div className="dax-stack" style={{ gap: 16 }}>
          {canManage ? <AddZoneForm /> : null}
          <ZoneList zones={zones} canManage={canManage} />
        </div>
      </SectionCard>
      <LabelSelection kind="bin" enabled={canPrint}>
        <SectionCard
          flush
          title="Bins"
          note={
            <>
              {formatCount(page.total)} total
              {canPrint && page.items.length ? (
                <>
                  {' · '}
                  <SelectionHint>
                    Tick bins to print their labels.
                  </SelectionHint>
                </>
              ) : null}
            </>
          }
          toolbar={
            <ListFilters
              searchPlaceholder="Bin code"
              selects={[
                {
                  name: 'zoneId',
                  label: 'Zone',
                  data: zones.map((z) => ({
                    value: z.id,
                    label: `${z.code} · ${z.name}`,
                  })),
                },
                { name: 'kind', label: 'Kind', data: BIN_KIND_OPTIONS },
                {
                  name: 'active',
                  label: 'Show',
                  defaultValue: 'true',
                  chips: true,
                  data: [
                    { value: 'true', label: 'Active' },
                    { value: 'false', label: 'Off' },
                    { value: 'all', label: 'All' },
                  ],
                },
              ]}
            />
          }
        >
          {page.items.length === 0 ? (
            <CardBody>
              <Empty title="No bins found">
                {zones.length
                  ? 'Try a different filter, or add bins.'
                  : 'Add a zone first, then add bins to it.'}
              </Empty>
            </CardBody>
          ) : (
            <>
              <Box visibleFrom="md">
                <Table>
                  <TableThead>
                    <TableTr>
                      {canPrint ? (
                        <TableTh w={40}>
                          <SelectAllCheckbox ids={ids} />
                        </TableTh>
                      ) : null}
                      <TableTh>Bin</TableTh>
                      <TableTh ta="right">Items</TableTh>
                      <TableTh>Notes</TableTh>
                      <TableTh />
                    </TableTr>
                  </TableThead>
                  {groups.map((group) => (
                    <ZoneTbody
                      key={group.zone.id}
                      zone={group.zone}
                      columns={4}
                      selectable={canPrint}
                    >
                      {group.bins.map((bin) => (
                        <TableTr key={bin.id}>
                          {canPrint ? (
                            <TableTd>
                              <SelectCheckbox id={bin.id} label={bin.code} />
                            </TableTd>
                          ) : null}
                          <TableTd>
                            <Link href={bins(bin)} className="dax-link">
                              <Mono>{bin.code}</Mono>
                            </Link>
                          </TableTd>
                          <TableTd className="dax-num">{bin.itemCount}</TableTd>
                          <TableTd>
                            <span
                              className="dax-muted"
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {bin.notes ?? ''}
                            </span>
                          </TableTd>
                          <TableTd>
                            <BinBadges bin={bin} />
                          </TableTd>
                        </TableTr>
                      ))}
                    </ZoneTbody>
                  ))}
                </Table>
              </Box>
              <Box hiddenFrom="md" className="dax-rows">
                {groups.map((group) => (
                  <ZoneSection key={group.zone.id} zone={group.zone}>
                    {group.bins.map((bin) => (
                      <div key={bin.id} className="dax-row">
                        <SelectCheckbox id={bin.id} label={bin.code} />
                        <div className="dax-row-main">
                          <Link
                            href={bins(bin)}
                            className="dax-link"
                            style={{ fontSize: 17 }}
                          >
                            <Mono>{bin.code}</Mono>
                          </Link>
                          <span className="dax-sub">
                            {bin.itemCount}{' '}
                            {bin.itemCount === 1 ? 'item' : 'items'}
                          </span>
                          <BinBadges bin={bin} />
                        </div>
                      </div>
                    ))}
                  </ZoneSection>
                ))}
              </Box>
            </>
          )}
          <Pager
            path={'/inventory/locations'}
            query={query}
            total={page.total}
            page={page.page}
            limit={page.limit}
          />
        </SectionCard>
      </LabelSelection>
    </>
  );
}

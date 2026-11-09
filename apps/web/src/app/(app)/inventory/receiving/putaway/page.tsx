import Link from 'next/link';
import { canDo, PageHead } from '@dax/web-shell';
import { isUuid } from '../../../../../lib/load';
import { flatten, type SearchParams } from '../../../../../lib/query';
import { requirePermission } from '../../../../../lib/server';
import { listPutaway } from '../_lib/data';
import { BASE } from '../_lib/labels';
import { type PutawayGroup, PutawayBoard } from './putaway-board';

export default async function PutawayPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const caps = await requirePermission(
    'inventory.grn.putaway',
    'inventory.grn.view',
  );
  const query = flatten(await searchParams);
  const onlyGrn = query['grn'] && isUuid(query['grn']) ? query['grn'] : null;
  const { rows } = await listPutaway();

  const groups = new Map<string, PutawayGroup>();
  for (const row of rows) {
    if (onlyGrn && row.grn.id !== onlyGrn) continue;
    const group = groups.get(row.grn.id) ?? {
      grn: row.grn,
      postedAt: row.postedAt,
      rows: [],
    };
    group.rows.push(row);
    groups.set(row.grn.id, group);
  }

  return (
    <>
      <PageHead
        back={{ href: BASE, label: 'Receiving' }}
        eyebrow="Receiving"
        title="Put away"
        lede="Received stock waits in the receiving bin. Move it to a shelf to make it free."
        actions={
          onlyGrn ? (
            <Link href={`${BASE}/putaway`} className="dax-link">
              Show every GRN
            </Link>
          ) : null
        }
      />
      <PutawayBoard
        groups={[...groups.values()]}
        canAct={canDo(caps, 'inventory.grn.putaway')}
      />
    </>
  );
}

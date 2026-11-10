import {
  ActionTiles,
  type ActionTileItem,
  canDo,
  PageHead,
  SectionCard,
} from '@dax/web-shell';
import { requirePermission } from '../../../../lib/server';
import { REPORT_SLUGS, REPORTS, reportPath } from './_lib/reports';

export default async function ReportsPage() {
  const caps = await requirePermission(
    'inventory.stock.view',
    'inventory.ledger.view',
  );
  const tiles: ActionTileItem[] = REPORT_SLUGS.filter((slug) =>
    canDo(caps, REPORTS[slug].view),
  ).map((slug) => ({
    href: reportPath(slug),
    title: REPORTS[slug].title,
    sub: REPORTS[slug].sub,
    icon: REPORTS[slug].icon,
    use: REPORTS[slug].use,
  }));

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Reports"
        lede="Quantities only. Each report can be filtered, and exported as CSV if your role allows it."
      />
      <SectionCard title="Which report do you need?">
        <ActionTiles items={tiles} />
      </SectionCard>
    </>
  );
}

import type { StockFigures } from '@dax/inventory-contract';
import { Figures, Pill } from '@dax/web-shell';
import { formatQty } from '../lib/format';

export function BelowMinBadge({ belowMin }: { belowMin: boolean }) {
  return belowMin ? <Pill tone="bad">Below minimum</Pill> : null;
}

export function StockLine({ stock }: { stock: StockFigures }) {
  return (
    <span className="dax-sub">
      On hand <b>{formatQty(stock.onHand)}</b> · Held{' '}
      <b>{formatQty(stock.held)}</b> · Free <b>{formatQty(stock.free)}</b>
      {Number(stock.receiving) > 0 ? (
        <>
          {' '}
          · In receiving <b>{formatQty(stock.receiving)}</b>
        </>
      ) : null}
    </span>
  );
}

export function StockPanel({
  stock,
  minQty,
  uom,
  belowMin = false,
}: {
  stock: StockFigures;
  minQty: string;
  uom: string;
  belowMin?: boolean;
}) {
  return (
    <Figures
      items={[
        {
          label: 'On hand',
          value: formatQty(stock.onHand),
          unit: uom,
          bad: belowMin,
        },
        { label: 'Held', value: formatQty(stock.held) },
        { label: 'Free', value: formatQty(stock.free) },
        { label: 'In receiving', value: formatQty(stock.receiving) },
        { label: 'Quarantine', value: formatQty(stock.quarantine) },
        { label: 'Minimum', value: formatQty(minQty), unit: uom },
      ]}
    />
  );
}

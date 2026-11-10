import { Alert } from '@mantine/core';
import Link from 'next/link';
import { REPORT_ROW_LIMIT } from '@dax/inventory-contract';
import { Mono } from '@dax/web-shell';
import { formatQty } from '../../../../../lib/format';

export function PartNo({
  item,
  linked,
}: {
  item: { id: string; partNo: string };
  linked: boolean;
}) {
  return linked ? (
    <Link href={`/inventory/items/${item.id}`} className="dax-link">
      <Mono>{item.partNo}</Mono>
    </Link>
  ) : (
    <b>
      <Mono>{item.partNo}</Mono>
    </b>
  );
}

export function SignedQty({ qty }: { qty: string }) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n === 0) return <>{qty}</>;
  return (
    <span className={n > 0 ? 'dax-qty-in' : 'dax-qty-out'}>
      {n > 0 ? '+' : '−'}
      {formatQty(String(Math.abs(n)))}
    </span>
  );
}

export function TruncatedNote({
  truncated,
  canExport,
}: {
  truncated: boolean;
  canExport: boolean;
}) {
  if (!truncated) return null;
  return (
    <Alert color="yellow" className="dax-no-print">
      Only the first {REPORT_ROW_LIMIT.toLocaleString('en-LK')} rows are shown.
      {canExport
        ? ' Narrow the filters, or export the CSV for the full list.'
        : ' Narrow the filters to see the rest.'}
    </Alert>
  );
}

'use client';

import {
  Alert,
  Box,
  Button,
  Group,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from '@mantine/core';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { MovementRow } from '@dax/inventory-contract';
import { Empty, Mono } from '@dax/web-shell';
import { formatDateTime, formatQty } from '../../../../../lib/format';
import { loadMovements } from '../../receiving/_lib/actions';
import { documentPath, MOVEMENT_LABELS } from '../../receiving/_lib/labels';

function SignedQty({ qty }: { qty: string }) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n === 0) return <>{qty}</>;
  return (
    <span className={n > 0 ? 'dax-qty-in' : 'dax-qty-out'}>
      {n > 0 ? '+' : '−'}
      {formatQty(String(Math.abs(n)))}
    </span>
  );
}

function Doc({ row }: { row: MovementRow }) {
  const href = documentPath(row.docType, row.docId);
  const label = <Mono>{row.docNumber ?? row.docType}</Mono>;
  return href ? (
    <Link href={href} className="dax-link">
      {label}
    </Link>
  ) : (
    label
  );
}

function movementLabel(row: MovementRow): string {
  return MOVEMENT_LABELS[row.movement];
}

export function Movements({
  itemId,
  uom,
  initial,
}: {
  itemId: string;
  uom: string;
  initial: { items: MovementRow[]; total: number; page: number };
}) {
  const [rows, setRows] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [total, setTotal] = useState(initial.total);
  const hasMore = rows.length < total;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function more() {
    if (!hasMore) return;
    startTransition(async () => {
      const next = await loadMovements(itemId, page + 1);
      setError(next.error ?? null);
      if (next.error) return;
      setRows((prev) => [...prev, ...next.rows]);
      setPage(page + 1);
      setTotal(next.total);
    });
  }

  if (rows.length === 0)
    return (
      <div className="dax-card-body">
        <Empty title="No movements yet">
          Every receipt and put-away of this part shows here.
        </Empty>
      </div>
    );

  return (
    <>
      <Box visibleFrom="md">
        <Table>
          <TableThead>
            <TableTr>
              <TableTh>When</TableTh>
              <TableTh>Movement</TableTh>
              <TableTh>Bin</TableTh>
              <TableTh ta="right">Quantity</TableTh>
              <TableTh ta="right">Bin after</TableTh>
              <TableTh>Document</TableTh>
              <TableTh>By</TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>
            {rows.map((row) => (
              <TableTr key={row.id}>
                <TableTd>{formatDateTime(row.occurredAt)}</TableTd>
                <TableTd>{movementLabel(row)}</TableTd>
                <TableTd>
                  <Mono>{row.bin.code}</Mono>
                </TableTd>
                <TableTd className="dax-num">
                  <SignedQty qty={row.qty} />
                </TableTd>
                <TableTd className="dax-num">
                  {formatQty(row.binQtyAfter)}{' '}
                  <span className="dax-muted">{uom}</span>
                </TableTd>
                <TableTd>
                  <Doc row={row} />
                </TableTd>
                <TableTd>{row.actor ?? '—'}</TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Box>
      <Box hiddenFrom="md" className="dax-rows">
        {rows.map((row) => (
          <div key={row.id} className="dax-row">
            <div className="dax-row-main">
              <Group justify="space-between" wrap="nowrap">
                <span>
                  {movementLabel(row)} <Mono>{row.bin.code}</Mono>
                </span>
                <b>
                  <SignedQty qty={row.qty} />
                </b>
              </Group>
              <span className="dax-sub">
                {formatDateTime(row.occurredAt)}
                {row.actor ? ` · ${row.actor}` : ''} · Bin now{' '}
                {formatQty(row.binQtyAfter)} {uom}
              </span>
              <span>
                <Doc row={row} />
              </span>
            </div>
          </div>
        ))}
      </Box>
      {error || hasMore ? (
        <div className="dax-card-body" style={{ paddingTop: 12 }}>
          {error ? <Alert color="red">{error}</Alert> : null}
          {hasMore ? (
            <Group justify="center">
              <Button variant="default" loading={pending} onClick={more}>
                Load more
              </Button>
            </Group>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

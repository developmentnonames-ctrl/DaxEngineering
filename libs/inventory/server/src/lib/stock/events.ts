import { z } from 'zod';
import { defineEvent } from '@dax/platform-core';

const Line = z.object({
  itemId: z.uuid(),
  qtyGood: z.string(),
  qtyDamaged: z.string(),
});

export const goodsReceived = defineEvent(
  'inventory.goods_received.v1',
  z.object({
    grnId: z.uuid(),
    number: z.string(),
    supplierId: z.uuid(),
    lines: z.array(Line),
  }),
);

export const grnReversed = defineEvent(
  'inventory.grn_reversed.v1',
  z.object({ grnId: z.uuid(), number: z.string() }),
);

export const stockPutAway = defineEvent(
  'inventory.stock_put_away.v1',
  z.object({
    grnId: z.uuid(),
    moves: z.array(
      z.object({ itemId: z.uuid(), binId: z.uuid(), qty: z.string() }),
    ),
  }),
);

export const stockIssued = defineEvent(
  'inventory.stock_issued.v1',
  z.object({
    aodId: z.uuid(),
    number: z.string(),
    mrnId: z.uuid(),
    lines: z.array(
      z.object({ itemId: z.uuid(), binId: z.uuid(), qty: z.string() }),
    ),
  }),
);

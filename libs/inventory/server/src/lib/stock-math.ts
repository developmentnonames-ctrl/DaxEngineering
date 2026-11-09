import type { StockFigures } from '@dax/inventory-contract';
import { Prisma } from '@dax/platform-db';

export type DecimalLike = Prisma.Decimal | string | number;

export interface BalanceRow {
  onHand: DecimalLike;
  held: DecimalLike;
  quarantine: DecimalLike;
  receiving?: DecimalLike;
}

export function dec(value: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function qtyString(value: DecimalLike): string {
  return dec(value).toDecimalPlaces(3).toFixed();
}

export function stockFigures(balance: BalanceRow | null | undefined): {
  figures: StockFigures;
  onHand: Prisma.Decimal;
} {
  const onHand = dec(balance?.onHand ?? 0);
  const held = dec(balance?.held ?? 0);
  const quarantine = dec(balance?.quarantine ?? 0);
  const receiving = dec(balance?.receiving ?? 0);
  return {
    onHand,
    figures: {
      onHand: qtyString(onHand),
      held: qtyString(held),
      quarantine: qtyString(quarantine),
      receiving: qtyString(receiving),
      free: qtyString(onHand.minus(held).minus(quarantine).minus(receiving)),
    },
  };
}

export function isBelowMin(onHand: DecimalLike, minQty: DecimalLike): boolean {
  const min = dec(minQty);
  return min.gt(0) && dec(onHand).lt(min);
}

export function isWhole(value: DecimalLike): boolean {
  return dec(value).isInteger();
}

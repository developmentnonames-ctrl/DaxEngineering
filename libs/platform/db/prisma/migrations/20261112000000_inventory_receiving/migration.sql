-- CreateEnum
CREATE TYPE "inventory"."MovementType" AS ENUM ('RECEIVE', 'RECEIVE_DAMAGED', 'PUTAWAY_OUT', 'PUTAWAY_IN', 'REVERSAL');

-- CreateEnum
CREATE TYPE "inventory"."ArrivalStatus" AS ENUM ('EXPECTED', 'RECEIVING', 'PARTLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "inventory"."GrnStatus" AS ENUM ('DRAFT', 'CHECKED', 'POSTED', 'PUT_AWAY', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "inventory"."GrnSubtype" AS ENUM ('FOR', 'LOC');

-- CreateEnum
CREATE TYPE "inventory"."DiscrepancyKind" AS ENUM ('SHORT', 'EXCESS', 'DAMAGED', 'WRONG_ITEM');

-- CreateEnum
CREATE TYPE "inventory"."DiscrepancyStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "inventory"."stock_balance" ADD COLUMN     "receiving" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "inventory"."stock_ledger" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "store_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "bin_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "bin_qty_after" DECIMAL(14,3) NOT NULL,
    "movement" "inventory"."MovementType" NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_id" UUID NOT NULL,
    "doc_line_id" UUID,
    "doc_number" TEXT,
    "reversal_of" UUID,
    "actor_id" UUID NOT NULL,
    "request_id" TEXT,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."expected_arrival" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "reference" TEXT,
    "packing_list" TEXT,
    "invoice_no" TEXT,
    "expected_date" DATE,
    "status" "inventory"."ArrivalStatus" NOT NULL DEFAULT 'EXPECTED',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "expected_arrival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."arrival_line" (
    "id" UUID NOT NULL,
    "arrival_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "qty_expected" DECIMAL(14,3) NOT NULL,
    "qty_received" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "arrival_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."grn" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "subtype" "inventory"."GrnSubtype" NOT NULL,
    "status" "inventory"."GrnStatus" NOT NULL DEFAULT 'DRAFT',
    "supplier_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "arrival_id" UUID,
    "delivery_note" TEXT,
    "delivery_date" DATE,
    "notes" TEXT,
    "checked_by" UUID,
    "checked_at" TIMESTAMPTZ(3),
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(3),
    "reversed_by" UUID,
    "reversed_at" TIMESTAMPTZ(3),
    "reverse_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "grn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."grn_line" (
    "id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "arrival_line_id" UUID,
    "qty_expected" DECIMAL(14,3),
    "qty_good" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_damaged" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_put_away" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "wrong_item" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "grn_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."discrepancy" (
    "id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "grn_line_id" UUID,
    "item_id" UUID NOT NULL,
    "kind" "inventory"."DiscrepancyKind" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "status" "inventory"."DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "close_note" TEXT,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_ledger_item_id_occurred_at_idx" ON "inventory"."stock_ledger"("item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_ledger_bin_id_occurred_at_idx" ON "inventory"."stock_ledger"("bin_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_ledger_doc_type_doc_id_idx" ON "inventory"."stock_ledger"("doc_type", "doc_id");

-- CreateIndex
CREATE INDEX "expected_arrival_status_expected_date_idx" ON "inventory"."expected_arrival"("status", "expected_date");

-- CreateIndex
CREATE UNIQUE INDEX "arrival_line_arrival_id_line_no_key" ON "inventory"."arrival_line"("arrival_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "grn_number_key" ON "inventory"."grn"("number");

-- CreateIndex
CREATE INDEX "grn_status_created_at_idx" ON "inventory"."grn"("status", "created_at");

-- CreateIndex
CREATE INDEX "grn_arrival_id_idx" ON "inventory"."grn"("arrival_id");

-- CreateIndex
CREATE INDEX "grn_line_item_id_idx" ON "inventory"."grn_line"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "grn_line_grn_id_line_no_key" ON "inventory"."grn_line"("grn_id", "line_no");

-- CreateIndex
CREATE INDEX "discrepancy_status_created_at_idx" ON "inventory"."discrepancy"("status", "created_at");

-- CreateIndex
CREATE INDEX "discrepancy_grn_id_idx" ON "inventory"."discrepancy"("grn_id");

-- AddForeignKey
ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "stock_ledger_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "stock_ledger_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."bin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."arrival_line" ADD CONSTRAINT "arrival_line_arrival_id_fkey" FOREIGN KEY ("arrival_id") REFERENCES "inventory"."expected_arrival"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."arrival_line" ADD CONSTRAINT "arrival_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."grn" ADD CONSTRAINT "grn_arrival_id_fkey" FOREIGN KEY ("arrival_id") REFERENCES "inventory"."expected_arrival"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."grn_line" ADD CONSTRAINT "grn_line_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "inventory"."grn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."grn_line" ADD CONSTRAINT "grn_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."grn_line" ADD CONSTRAINT "grn_line_arrival_line_id_fkey" FOREIGN KEY ("arrival_line_id") REFERENCES "inventory"."arrival_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."discrepancy" ADD CONSTRAINT "discrepancy_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "inventory"."grn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."discrepancy" ADD CONSTRAINT "discrepancy_grn_line_id_fkey" FOREIGN KEY ("grn_line_id") REFERENCES "inventory"."grn_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."discrepancy" ADD CONSTRAINT "discrepancy_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "inventory"."stock_balance" DROP CONSTRAINT "stock_balance_held_check";
ALTER TABLE "inventory"."stock_balance" ADD CONSTRAINT "stock_balance_receiving_check" CHECK ("receiving" >= 0);
ALTER TABLE "inventory"."stock_balance" ADD CONSTRAINT "stock_balance_buckets_check"
  CHECK ("held" >= 0 AND "held" + "quarantine" + "receiving" <= "on_hand");

ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "stock_ledger_qty_check" CHECK ("qty" <> 0);
ALTER TABLE "inventory"."stock_ledger" ADD CONSTRAINT "stock_ledger_after_check" CHECK ("bin_qty_after" >= 0);

ALTER TABLE "inventory"."arrival_line" ADD CONSTRAINT "arrival_line_qty_check" CHECK ("qty_expected" > 0 AND "qty_received" >= 0);
ALTER TABLE "inventory"."grn_line" ADD CONSTRAINT "grn_line_qty_check"
  CHECK ("qty_good" >= 0 AND "qty_damaged" >= 0 AND "qty_put_away" >= 0 AND "qty_put_away" <= "qty_good");
ALTER TABLE "inventory"."discrepancy" ADD CONSTRAINT "discrepancy_qty_check" CHECK ("qty" > 0);
ALTER TABLE "inventory"."grn" ADD CONSTRAINT "grn_number_when_posted"
  CHECK ("status" IN ('DRAFT', 'CHECKED', 'CANCELLED') OR "number" IS NOT NULL);

CREATE FUNCTION "inventory"."reject_ledger_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory.stock_ledger is append-only';
END $$;

CREATE TRIGGER "stock_ledger_append_only" BEFORE UPDATE OR DELETE ON "inventory"."stock_ledger"
  FOR EACH ROW EXECUTE FUNCTION "inventory"."reject_ledger_change"();
CREATE TRIGGER "stock_ledger_no_truncate" BEFORE TRUNCATE ON "inventory"."stock_ledger"
  FOR EACH STATEMENT EXECUTE FUNCTION "inventory"."reject_ledger_change"();

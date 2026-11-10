-- CreateEnum
CREATE TYPE "inventory"."CountKind" AS ENUM ('CYCLE', 'FULL', 'OPENING');

-- CreateEnum
CREATE TYPE "inventory"."CountStatus" AS ENUM ('COUNTING', 'SUBMITTED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "inventory"."ReturnStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "inventory"."ReturnCondition" AS ENUM ('GOOD', 'DAMAGED', 'FAULTY');

-- CreateEnum
CREATE TYPE "inventory"."WarrantyStatus" AS ENUM ('TAGGED', 'SENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "inventory"."WarrantyOutcome" AS ENUM ('REPLACED', 'CREDITED', 'REJECTED', 'RETURNED_TO_CUSTOMER', 'SCRAPPED');

-- AlterEnum
ALTER TYPE "inventory"."MovementType" ADD VALUE 'RETURN';
ALTER TYPE "inventory"."MovementType" ADD VALUE 'COUNT_ADJUST';
ALTER TYPE "inventory"."MovementType" ADD VALUE 'OPENING';

-- AlterTable
ALTER TABLE "inventory"."bin" ADD COLUMN     "count_id" UUID,
ADD COLUMN     "opened_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "inventory"."stock_count" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "inventory"."CountKind" NOT NULL,
    "status" "inventory"."CountStatus" NOT NULL DEFAULT 'COUNTING',
    "blind" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "reject_reason" TEXT,
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "stock_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."count_line" (
    "id" UUID NOT NULL,
    "count_id" UUID NOT NULL,
    "bin_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "system_qty" DECIMAL(14,3) NOT NULL,
    "counted_qty" DECIMAL(14,3),
    "counted_by" UUID,
    "counted_at" TIMESTAMPTZ(3),
    "added" BOOLEAN NOT NULL DEFAULT false,
    "adjust_qty" DECIMAL(14,3),

    CONSTRAINT "count_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."return_note" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "status" "inventory"."ReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "aod_id" UUID,
    "department_id" UUID NOT NULL,
    "department_name" TEXT NOT NULL,
    "customer_id" UUID,
    "customer_name" TEXT,
    "job_number" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "return_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."return_line" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "aod_line_id" UUID,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "condition" "inventory"."ReturnCondition" NOT NULL,
    "bin_id" UUID,
    "serial_no" TEXT,
    "notes" TEXT,
    "warranty_tag_id" UUID,

    CONSTRAINT "return_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."warranty_tag" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "inventory"."WarrantyStatus" NOT NULL DEFAULT 'TAGGED',
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "serial_no" TEXT,
    "machine_model_id" UUID,
    "machine_serial" TEXT,
    "job_number" TEXT,
    "customer_id" UUID,
    "customer_name" TEXT,
    "supplier_id" UUID,
    "supplier_name" TEXT,
    "claim_number" TEXT,
    "fault" TEXT NOT NULL,
    "bin_id" UUID NOT NULL,
    "return_line_id" UUID,
    "sent_by" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "outcome" "inventory"."WarrantyOutcome",
    "close_note" TEXT,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "warranty_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_number_key" ON "inventory"."stock_count"("number");

-- CreateIndex
CREATE INDEX "stock_count_status_created_at_idx" ON "inventory"."stock_count"("status", "created_at");

-- CreateIndex
CREATE INDEX "count_line_bin_id_idx" ON "inventory"."count_line"("bin_id");

-- CreateIndex
CREATE INDEX "count_line_item_id_idx" ON "inventory"."count_line"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "count_line_count_id_bin_id_item_id_key" ON "inventory"."count_line"("count_id", "bin_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_note_number_key" ON "inventory"."return_note"("number");

-- CreateIndex
CREATE INDEX "return_note_status_created_at_idx" ON "inventory"."return_note"("status", "created_at");

-- CreateIndex
CREATE INDEX "return_note_aod_id_idx" ON "inventory"."return_note"("aod_id");

-- CreateIndex
CREATE INDEX "return_line_aod_line_id_idx" ON "inventory"."return_line"("aod_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_line_return_id_line_no_key" ON "inventory"."return_line"("return_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_tag_number_key" ON "inventory"."warranty_tag"("number");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_tag_return_line_id_key" ON "inventory"."warranty_tag"("return_line_id");

-- CreateIndex
CREATE INDEX "warranty_tag_status_created_at_idx" ON "inventory"."warranty_tag"("status", "created_at");

-- CreateIndex
CREATE INDEX "warranty_tag_item_id_idx" ON "inventory"."warranty_tag"("item_id");

-- AddForeignKey
ALTER TABLE "inventory"."count_line" ADD CONSTRAINT "count_line_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "inventory"."stock_count"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."count_line" ADD CONSTRAINT "count_line_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."bin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."count_line" ADD CONSTRAINT "count_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."return_note" ADD CONSTRAINT "return_note_aod_id_fkey" FOREIGN KEY ("aod_id") REFERENCES "inventory"."aod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."return_line" ADD CONSTRAINT "return_line_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "inventory"."return_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."return_line" ADD CONSTRAINT "return_line_aod_line_id_fkey" FOREIGN KEY ("aod_line_id") REFERENCES "inventory"."aod_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."return_line" ADD CONSTRAINT "return_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."return_line" ADD CONSTRAINT "return_line_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."bin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."warranty_tag" ADD CONSTRAINT "warranty_tag_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."warranty_tag" ADD CONSTRAINT "warranty_tag_machine_model_id_fkey" FOREIGN KEY ("machine_model_id") REFERENCES "inventory"."machine_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."warranty_tag" ADD CONSTRAINT "warranty_tag_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."bin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "inventory"."return_note" ADD CONSTRAINT "return_note_number_after_draft"
  CHECK ("status" IN ('DRAFT', 'CANCELLED') OR "number" IS NOT NULL);
ALTER TABLE "inventory"."return_note" ADD CONSTRAINT "return_note_free_needs_reason"
  CHECK ("aod_id" IS NOT NULL OR "reason" IS NOT NULL);
ALTER TABLE "inventory"."return_line" ADD CONSTRAINT "return_line_qty_check" CHECK ("qty" > 0);
ALTER TABLE "inventory"."return_line" ADD CONSTRAINT "return_line_bin_unless_faulty"
  CHECK ("condition" = 'FAULTY' OR "bin_id" IS NOT NULL);
ALTER TABLE "inventory"."count_line" ADD CONSTRAINT "count_line_qty_check"
  CHECK ("system_qty" >= 0 AND ("counted_qty" IS NULL OR "counted_qty" >= 0));
ALTER TABLE "inventory"."stock_count" ADD CONSTRAINT "stock_count_posted_needs_approver"
  CHECK ("status" <> 'POSTED' OR "approved_by" IS NOT NULL);
ALTER TABLE "inventory"."stock_count" ADD CONSTRAINT "stock_count_approver_not_submitter"
  CHECK ("approved_by" IS NULL OR "approved_by" <> "submitted_by");
ALTER TABLE "inventory"."warranty_tag" ADD CONSTRAINT "warranty_tag_qty_check" CHECK ("qty" > 0);
ALTER TABLE "inventory"."warranty_tag" ADD CONSTRAINT "warranty_tag_closed_needs_outcome"
  CHECK ("status" <> 'CLOSED' OR "outcome" IS NOT NULL);

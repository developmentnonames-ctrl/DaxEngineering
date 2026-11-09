-- CreateEnum
CREATE TYPE "inventory"."ReservationSource" AS ENUM ('HOLD', 'MRN');

-- CreateEnum
CREATE TYPE "inventory"."HoldStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "inventory"."MrnSubtype" AS ENUM ('PRT', 'SRV', 'SAL');

-- CreateEnum
CREATE TYPE "inventory"."MrnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHECKED', 'READY', 'PARTLY_ISSUED', 'ISSUED', 'CLOSED', 'SHORT_CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "inventory"."AodType" AS ENUM ('SER', 'REP', 'INS', 'BRK', 'DIR', 'HIR');

-- CreateEnum
CREATE TYPE "inventory"."AodStatus" AS ENUM ('PICKING', 'ISSUED', 'SIGNED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "inventory"."MovementType" ADD VALUE 'ISSUE';

-- CreateTable
CREATE TABLE "inventory"."reservation" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "source" "inventory"."ReservationSource" NOT NULL,
    "source_id" UUID NOT NULL,
    "source_line_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."hold" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "inventory"."HoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "customer_id" UUID,
    "customer_name" TEXT,
    "department_id" UUID NOT NULL,
    "department_name" TEXT NOT NULL,
    "reason" TEXT,
    "converted_mrn_id" UUID,
    "released_by" UUID,
    "released_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."hold_line" (
    "id" UUID NOT NULL,
    "hold_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "hold_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."mrn" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "subtype" "inventory"."MrnSubtype" NOT NULL,
    "status" "inventory"."MrnStatus" NOT NULL DEFAULT 'DRAFT',
    "department_id" UUID NOT NULL,
    "department_name" TEXT NOT NULL,
    "customer_id" UUID,
    "customer_name" TEXT,
    "job_number" TEXT,
    "customer_po" TEXT,
    "quotation_ref" TEXT,
    "notes" TEXT,
    "hold_id" UUID,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "checked_by" UUID,
    "checked_at" TIMESTAMPTZ(3),
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "close_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "mrn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."mrn_line" (
    "id" UUID NOT NULL,
    "mrn_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "qty_requested" DECIMAL(14,3) NOT NULL,
    "qty_issued" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qty_short_closed" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "mrn_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."aod" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "type" "inventory"."AodType" NOT NULL,
    "status" "inventory"."AodStatus" NOT NULL DEFAULT 'PICKING',
    "mrn_id" UUID NOT NULL,
    "deliver_to" TEXT,
    "vehicle_no" TEXT,
    "notes" TEXT,
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(3),
    "signed_by" UUID,
    "signed_at" TIMESTAMPTZ(3),
    "signed_file" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "aod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."aod_line" (
    "id" UUID NOT NULL,
    "aod_id" UUID NOT NULL,
    "mrn_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "bin_id" UUID,
    "qty" DECIMAL(14,3) NOT NULL,
    "scanned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "aod_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_item_id_idx" ON "inventory"."reservation"("item_id");

-- CreateIndex
CREATE INDEX "reservation_source_source_id_idx" ON "inventory"."reservation"("source", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_source_source_line_id_key" ON "inventory"."reservation"("source", "source_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "hold_number_key" ON "inventory"."hold"("number");

-- CreateIndex
CREATE INDEX "hold_status_created_at_idx" ON "inventory"."hold"("status", "created_at");

-- CreateIndex
CREATE INDEX "hold_department_id_idx" ON "inventory"."hold"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "hold_line_hold_id_line_no_key" ON "inventory"."hold_line"("hold_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "mrn_number_key" ON "inventory"."mrn"("number");

-- CreateIndex
CREATE INDEX "mrn_status_created_at_idx" ON "inventory"."mrn"("status", "created_at");

-- CreateIndex
CREATE INDEX "mrn_department_id_idx" ON "inventory"."mrn"("department_id");

-- CreateIndex
CREATE INDEX "mrn_created_by_idx" ON "inventory"."mrn"("created_by");

-- CreateIndex
CREATE INDEX "mrn_line_item_id_idx" ON "inventory"."mrn_line"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "mrn_line_mrn_id_line_no_key" ON "inventory"."mrn_line"("mrn_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "aod_number_key" ON "inventory"."aod"("number");

-- CreateIndex
CREATE INDEX "aod_status_created_at_idx" ON "inventory"."aod"("status", "created_at");

-- CreateIndex
CREATE INDEX "aod_mrn_id_idx" ON "inventory"."aod"("mrn_id");

-- CreateIndex
CREATE INDEX "aod_line_aod_id_idx" ON "inventory"."aod_line"("aod_id");

-- CreateIndex
CREATE INDEX "aod_line_mrn_line_id_idx" ON "inventory"."aod_line"("mrn_line_id");

-- AddForeignKey
ALTER TABLE "inventory"."reservation" ADD CONSTRAINT "reservation_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."hold_line" ADD CONSTRAINT "hold_line_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "inventory"."hold"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."hold_line" ADD CONSTRAINT "hold_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."mrn_line" ADD CONSTRAINT "mrn_line_mrn_id_fkey" FOREIGN KEY ("mrn_id") REFERENCES "inventory"."mrn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."mrn_line" ADD CONSTRAINT "mrn_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."aod" ADD CONSTRAINT "aod_mrn_id_fkey" FOREIGN KEY ("mrn_id") REFERENCES "inventory"."mrn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."aod_line" ADD CONSTRAINT "aod_line_aod_id_fkey" FOREIGN KEY ("aod_id") REFERENCES "inventory"."aod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."aod_line" ADD CONSTRAINT "aod_line_mrn_line_id_fkey" FOREIGN KEY ("mrn_line_id") REFERENCES "inventory"."mrn_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."aod_line" ADD CONSTRAINT "aod_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."aod_line" ADD CONSTRAINT "aod_line_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."bin"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "inventory"."reservation" ADD CONSTRAINT "reservation_qty_check" CHECK ("qty" > 0);
ALTER TABLE "inventory"."hold_line" ADD CONSTRAINT "hold_line_qty_check" CHECK ("qty" > 0);
ALTER TABLE "inventory"."mrn_line" ADD CONSTRAINT "mrn_line_qty_check"
  CHECK ("qty_requested" > 0 AND "qty_issued" >= 0 AND "qty_short_closed" >= 0
         AND "qty_issued" + "qty_short_closed" <= "qty_requested");
ALTER TABLE "inventory"."aod_line" ADD CONSTRAINT "aod_line_qty_check" CHECK ("qty" > 0);
ALTER TABLE "inventory"."mrn" ADD CONSTRAINT "mrn_number_after_draft"
  CHECK ("status" IN ('DRAFT', 'CANCELLED') OR "number" IS NOT NULL);
ALTER TABLE "inventory"."aod" ADD CONSTRAINT "aod_number_when_issued"
  CHECK ("status" IN ('PICKING', 'CANCELLED') OR "number" IS NOT NULL);
ALTER TABLE "inventory"."aod" ADD CONSTRAINT "aod_signed_needs_file"
  CHECK ("status" <> 'SIGNED' OR "signed_file" IS NOT NULL);
ALTER TABLE "inventory"."hold" ADD CONSTRAINT "hold_converted_needs_mrn"
  CHECK ("status" <> 'CONVERTED' OR "converted_mrn_id" IS NOT NULL);

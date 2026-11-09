-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "parties";
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateEnum
CREATE TYPE "inventory"."ItemStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "inventory"."BinKind" AS ENUM ('STORAGE', 'RECEIVING', 'QUARANTINE', 'WARRANTY');

-- CreateEnum
CREATE TYPE "inventory"."BarcodeKind" AS ENUM ('MANUFACTURER', 'SUPPLIER', 'ALTERNATE');

-- AlterTable
ALTER TABLE "core"."number_series" ADD COLUMN     "yearly" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "inventory"."brand" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."machine_model" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "machine_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."item" (
    "id" UUID NOT NULL,
    "part_no" TEXT NOT NULL,
    "part_no_norm" TEXT NOT NULL,
    "brand_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "allow_fraction" BOOLEAN NOT NULL DEFAULT false,
    "min_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "default_bin_id" UUID,
    "superseded_by_id" UUID,
    "status" "inventory"."ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "qr_token" TEXT NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."item_machine_model" (
    "item_id" UUID NOT NULL,
    "machine_model_id" UUID NOT NULL,

    CONSTRAINT "item_machine_model_pkey" PRIMARY KEY ("item_id","machine_model_id")
);

-- CreateTable
CREATE TABLE "inventory"."item_barcode" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "inventory"."BarcodeKind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."store" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."zone" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."bin" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "rack" TEXT NOT NULL,
    "shelf" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "kind" "inventory"."BinKind" NOT NULL DEFAULT 'STORAGE',
    "qr_token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "bin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."bin_stock" (
    "bin_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bin_stock_pkey" PRIMARY KEY ("bin_id","item_id")
);

-- CreateTable
CREATE TABLE "inventory"."stock_balance" (
    "store_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "held" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quarantine" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balance_pkey" PRIMARY KEY ("store_id","item_id")
);

-- CreateTable
CREATE TABLE "parties"."customer" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "tax_id" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties"."supplier" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "is_foreign" BOOLEAN NOT NULL DEFAULT false,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "tax_id" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brand_name_key" ON "inventory"."brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "machine_model_name_key" ON "inventory"."machine_model"("name");

-- CreateIndex
CREATE UNIQUE INDEX "item_qr_token_key" ON "inventory"."item"("qr_token");

-- CreateIndex
CREATE INDEX "item_part_no_norm_idx" ON "inventory"."item"("part_no_norm");

-- CreateIndex
CREATE INDEX "item_status_idx" ON "inventory"."item"("status");

-- CreateIndex
CREATE UNIQUE INDEX "item_brand_id_part_no_norm_key" ON "inventory"."item"("brand_id", "part_no_norm");

-- CreateIndex
CREATE INDEX "item_machine_model_machine_model_id_idx" ON "inventory"."item_machine_model"("machine_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_barcode_code_key" ON "inventory"."item_barcode"("code");

-- CreateIndex
CREATE INDEX "item_barcode_item_id_idx" ON "inventory"."item_barcode"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_code_key" ON "inventory"."store"("code");

-- CreateIndex
CREATE UNIQUE INDEX "zone_store_id_code_key" ON "inventory"."zone"("store_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "bin_qr_token_key" ON "inventory"."bin"("qr_token");

-- CreateIndex
CREATE INDEX "bin_zone_id_idx" ON "inventory"."bin"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "bin_store_id_code_key" ON "inventory"."bin"("store_id", "code");

-- CreateIndex
CREATE INDEX "bin_stock_item_id_idx" ON "inventory"."bin_stock"("item_id");

-- CreateIndex
CREATE INDEX "stock_balance_item_id_idx" ON "inventory"."stock_balance"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_code_key" ON "parties"."customer"("code");

-- CreateIndex
CREATE INDEX "customer_active_name_idx" ON "parties"."customer"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_code_key" ON "parties"."supplier"("code");

-- CreateIndex
CREATE INDEX "supplier_active_name_idx" ON "parties"."supplier"("active", "name");

-- AddForeignKey
ALTER TABLE "inventory"."machine_model" ADD CONSTRAINT "machine_model_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "inventory"."brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."item" ADD CONSTRAINT "item_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "inventory"."brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."item" ADD CONSTRAINT "item_default_bin_id_fkey" FOREIGN KEY ("default_bin_id") REFERENCES "inventory"."bin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."item" ADD CONSTRAINT "item_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "inventory"."item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."item_machine_model" ADD CONSTRAINT "item_machine_model_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."item_machine_model" ADD CONSTRAINT "item_machine_model_machine_model_id_fkey" FOREIGN KEY ("machine_model_id") REFERENCES "inventory"."machine_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."item_barcode" ADD CONSTRAINT "item_barcode_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."zone" ADD CONSTRAINT "zone_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "inventory"."store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."bin" ADD CONSTRAINT "bin_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "inventory"."store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."bin" ADD CONSTRAINT "bin_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "inventory"."zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."bin_stock" ADD CONSTRAINT "bin_stock_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "inventory"."bin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."bin_stock" ADD CONSTRAINT "bin_stock_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_balance" ADD CONSTRAINT "stock_balance_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "inventory"."store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_balance" ADD CONSTRAINT "stock_balance_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE SCHEMA IF NOT EXISTS "ext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "ext";

CREATE INDEX "item_part_no_norm_trgm" ON "inventory"."item" USING gin ("part_no_norm" "ext"."gin_trgm_ops");
CREATE INDEX "item_description_trgm" ON "inventory"."item" USING gin (lower("description") "ext"."gin_trgm_ops");
CREATE INDEX "customer_name_trgm" ON "parties"."customer" USING gin (lower("name") "ext"."gin_trgm_ops");
CREATE INDEX "supplier_name_trgm" ON "parties"."supplier" USING gin (lower("name") "ext"."gin_trgm_ops");

ALTER TABLE "inventory"."item" ADD CONSTRAINT "item_min_qty_check" CHECK ("min_qty" >= 0);
ALTER TABLE "inventory"."item" ADD CONSTRAINT "item_not_self_superseded" CHECK ("superseded_by_id" IS NULL OR "superseded_by_id" <> "id");
ALTER TABLE "inventory"."item" ADD CONSTRAINT "item_part_no_norm_check" CHECK ("part_no_norm" ~ '^[A-Z0-9]+$');
ALTER TABLE "inventory"."bin_stock" ADD CONSTRAINT "bin_stock_qty_check" CHECK ("qty" >= 0);
ALTER TABLE "inventory"."stock_balance" ADD CONSTRAINT "stock_balance_on_hand_check" CHECK ("on_hand" >= 0);
ALTER TABLE "inventory"."stock_balance" ADD CONSTRAINT "stock_balance_held_check" CHECK ("held" >= 0 AND "held" <= "on_hand");
ALTER TABLE "inventory"."stock_balance" ADD CONSTRAINT "stock_balance_quarantine_check" CHECK ("quarantine" >= 0);

INSERT INTO "inventory"."store" ("id", "code", "name") VALUES (gen_random_uuid(), 'MAIN', 'Main store');

CREATE UNIQUE INDEX "brand_name_lower_key" ON "inventory"."brand" (lower("name"));
CREATE UNIQUE INDEX "machine_model_name_lower_key" ON "inventory"."machine_model" (lower("name"));

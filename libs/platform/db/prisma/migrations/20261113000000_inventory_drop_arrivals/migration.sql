-- Expected arrivals were dropped from the product; GRN lines keep an optional delivery-note quantity.
ALTER TABLE "inventory"."grn" DROP CONSTRAINT IF EXISTS "grn_arrival_id_fkey";
DROP INDEX IF EXISTS "inventory"."grn_arrival_id_idx";
ALTER TABLE "inventory"."grn" DROP COLUMN IF EXISTS "arrival_id";

ALTER TABLE "inventory"."grn_line" DROP CONSTRAINT IF EXISTS "grn_line_arrival_line_id_fkey";
ALTER TABLE "inventory"."grn_line" DROP COLUMN IF EXISTS "arrival_line_id";

DROP TABLE IF EXISTS "inventory"."arrival_line";
DROP TABLE IF EXISTS "inventory"."expected_arrival";
DROP TYPE IF EXISTS "inventory"."ArrivalStatus";

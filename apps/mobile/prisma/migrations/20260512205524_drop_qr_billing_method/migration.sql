-- Drop QR from PaymentMethod enum.
--
-- The studio never used QR-tagged payments as a distinct flow: QR sales
-- settled as cash in practice. Re-tag any historical QR rows to CASH so
-- the enum value can be removed without an FK violation, then rebuild
-- the enum without QR.

-- Step 1: re-tag existing QR rows to CASH.
UPDATE "BillingRecord" SET "method" = 'CASH' WHERE "method" = 'QR';

-- Step 2: rebuild the enum without QR. Postgres can't drop an enum value
-- in place; the documented pattern is rename-old, create-new, alter-cols,
-- drop-old.
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";

CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'COMPANY', 'MANUAL_ONLINE');

ALTER TABLE "BillingRecord"
  ALTER COLUMN "method" TYPE "PaymentMethod"
  USING ("method"::text::"PaymentMethod");

DROP TYPE "PaymentMethod_old";

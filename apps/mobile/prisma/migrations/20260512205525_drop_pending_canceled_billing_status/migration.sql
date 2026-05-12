-- Drop PENDING and CANCELED from BillingStatus enum.
--
-- The studio doesn't run a payment-confirmation workflow — payments are
-- recorded at the moment of cash/card/transfer, so PENDING and CANCELED
-- never get used. Migrate any leftover rows in those states to CONFIRMED
-- (the only remaining value), drop the column default referencing PENDING,
-- rebuild the enum, then re-apply CONFIRMED as the new default.

-- Step 1: re-tag any historical PENDING/CANCELED rows to CONFIRMED so the
-- enum values can be removed without an FK violation.
UPDATE "BillingRecord"
  SET "status" = 'CONFIRMED'
  WHERE "status" IN ('PENDING', 'CANCELED');

-- Step 2: drop the existing column default so the rebuild isn't blocked
-- by a default pointing at a value the new enum won't have.
ALTER TABLE "BillingRecord" ALTER COLUMN "status" DROP DEFAULT;

-- Step 3: rebuild the enum with only CONFIRMED.
ALTER TYPE "BillingStatus" RENAME TO "BillingStatus_old";

CREATE TYPE "BillingStatus" AS ENUM ('CONFIRMED');

ALTER TABLE "BillingRecord"
  ALTER COLUMN "status" TYPE "BillingStatus"
  USING ("status"::text::"BillingStatus");

DROP TYPE "BillingStatus_old";

-- Step 4: re-apply CONFIRMED as the column default (matches schema.prisma).
ALTER TABLE "BillingRecord" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

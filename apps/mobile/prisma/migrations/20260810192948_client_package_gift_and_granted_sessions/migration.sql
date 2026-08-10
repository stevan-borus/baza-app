-- AlterTable: gift/comp flag. A gift keeps its real packageTypeId (and so its
-- real price) but is activated without payment, so it never carries a
-- BillingRecord.
ALTER TABLE "ClientPackage" ADD COLUMN     "isGift" BOOLEAN NOT NULL DEFAULT false;

-- sessionsGranted snapshots how many sessions the package actually granted,
-- instead of deriving the total from PackageType.sessionCount. Required, so it
-- is added nullable, backfilled from each row's own SKU (leaving every existing
-- paid package's "x/y" reading exactly as before), then locked down.
ALTER TABLE "ClientPackage" ADD COLUMN     "sessionsGranted" INTEGER;

UPDATE "ClientPackage" cp
SET "sessionsGranted" = pt."sessionCount"
FROM "PackageType" pt
WHERE pt."id" = cp."packageTypeId"
  AND cp."sessionsGranted" IS NULL;

ALTER TABLE "ClientPackage" ALTER COLUMN "sessionsGranted" SET NOT NULL;

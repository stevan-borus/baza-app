/*
  Warnings:

  - You are about to drop the column `periodId` on the `PayrollAdjustment` table. All the data in the column will be lost.
  - You are about to drop the `PayrollLine` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PayrollPeriod` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `periodStart` to the `PayrollAdjustment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `trainerUserId` to the `PayrollAdjustment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clientName` to the `SessionConsumption` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PayrollAdjustment" DROP CONSTRAINT "PayrollAdjustment_periodId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollLine" DROP CONSTRAINT "PayrollLine_periodId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollLine" DROP CONSTRAINT "PayrollLine_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollPeriod" DROP CONSTRAINT "PayrollPeriod_lockedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollPeriod" DROP CONSTRAINT "PayrollPeriod_trainerUserId_fkey";

-- DropForeignKey
ALTER TABLE "SessionConsumption" DROP CONSTRAINT "SessionConsumption_clientProfileId_fkey";

-- DropIndex
DROP INDEX "PayrollAdjustment_periodId_idx";

-- AlterTable
ALTER TABLE "PayrollAdjustment" DROP COLUMN "periodId",
ADD COLUMN     "periodStart" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "trainerUserId" TEXT NOT NULL;

-- AlterTable
-- clientName lands nullable first so existing rows can be backfilled below,
-- then becomes required. Adding it NOT NULL outright fails on any environment
-- that already has consumption history (staging has ~450 rows).
ALTER TABLE "SessionConsumption" ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "isGift" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "packageName" TEXT,
ADD COLUMN     "sessionValue" INTEGER,
ALTER COLUMN "clientProfileId" DROP NOT NULL;

-- Backfill the snapshot for attendances consumed before it existed.
--
-- These are derived from CURRENT package prices rather than the price at the
-- time, because that is the only information left — the whole reason this
-- column now exists. Accurate going forward; best-effort for history.
WITH resolved AS (
  SELECT
    sc.id AS consumption_id,
    COALESCE(NULLIF(TRIM(u."firstName" || ' ' || u."lastName"), ''), '—') AS client_name,
    pt.name AS package_name,
    COALESCE(cp."isGift", false) AS is_gift,
    CASE
      WHEN pt.price IS NULL THEN NULL
      WHEN COALESCE(cp."sessionsGranted", 0) + COALESCE(cp."bonusSessions", 0) <= 0 THEN NULL
      ELSE ROUND(pt.price::numeric / (cp."sessionsGranted" + cp."bonusSessions"))::int
    END AS session_value
  FROM "SessionConsumption" sc
  JOIN "ClientProfile" prof ON prof.id = sc."clientProfileId"
  JOIN "User" u ON u.id = prof."userId"
  JOIN "Session" s2 ON s2.id = sc."sessionId"
  LEFT JOIN LATERAL (
    -- The package that most plausibly paid for this attendance: the client's
    -- package covering the session's class type and live at its start.
    SELECT p.*
    FROM "ClientPackage" p
    JOIN "ClientPackageClassType" pct ON pct."clientPackageId" = p.id
    WHERE p."clientProfileId" = prof.id
      AND pct."classTypeId" = s2."classTypeId"
      AND p."startsAt" <= s2."startsAt"
      AND p."expiresAt" >= s2."startsAt"
    ORDER BY p."startsAt" DESC
    LIMIT 1
  ) cp ON true
  LEFT JOIN "PackageType" pt ON pt.id = cp."packageTypeId"
)
UPDATE "SessionConsumption" sc
SET
  "clientName" = resolved.client_name,
  "packageName" = resolved.package_name,
  "isGift" = resolved.is_gift,
  "sessionValue" = resolved.session_value
FROM resolved
WHERE resolved.consumption_id = sc.id;

-- Anything still unmatched (a client row already gone) keeps a readable label
-- rather than blocking the constraint.
UPDATE "SessionConsumption" SET "clientName" = '—' WHERE "clientName" IS NULL;

ALTER TABLE "SessionConsumption" ALTER COLUMN "clientName" SET NOT NULL;

-- DropTable
DROP TABLE "PayrollLine";

-- DropTable
DROP TABLE "PayrollPeriod";

-- DropEnum
DROP TYPE "PayrollPeriodStatus";

-- CreateIndex
CREATE INDEX "PayrollAdjustment_trainerUserId_periodStart_idx" ON "PayrollAdjustment"("trainerUserId", "periodStart");

-- CreateIndex
CREATE INDEX "SessionConsumption_sessionId_idx" ON "SessionConsumption"("sessionId");

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionConsumption" ADD CONSTRAINT "SessionConsumption_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentDocumentKey" ADD VALUE 'social_media';
ALTER TYPE "ConsentDocumentKey" ADD VALUE 'health_intake';

-- CreateTable
CREATE TABLE "ClientHealthIntake" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "isPhysicallyActive" BOOLEAN NOT NULL,
    "isFirstPilates" BOOLEAN NOT NULL,
    "hasComplaints" BOOLEAN NOT NULL,
    "complaintsDetails" TEXT,
    "hasInjuries" BOOLEAN NOT NULL,
    "injuriesDetails" TEXT,
    "isPregnant" BOOLEAN NOT NULL,
    "isPostpartum" BOOLEAN NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT,
    "guardianName" TEXT,
    "guardianRelation" TEXT,

    CONSTRAINT "ClientHealthIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthIntakeWithdrawal" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthIntakeWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientHealthIntake_clientProfileId_recordedAt_idx" ON "ClientHealthIntake"("clientProfileId", "recordedAt");

-- CreateIndex
CREATE INDEX "HealthIntakeWithdrawal_clientProfileId_withdrawnAt_idx" ON "HealthIntakeWithdrawal"("clientProfileId", "withdrawnAt");

-- AddForeignKey
ALTER TABLE "ClientHealthIntake" ADD CONSTRAINT "ClientHealthIntake_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHealthIntake" ADD CONSTRAINT "ClientHealthIntake_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthIntakeWithdrawal" ADD CONSTRAINT "HealthIntakeWithdrawal_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ConsentDocumentKey" AS ENUM ('tos', 'privacy', 'eula', 'waiver_adult', 'waiver_minor');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CONSENT_REFUSED';
ALTER TYPE "NotificationType" ADD VALUE 'MINOR_PAPER_NEEDED';

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentKey" "ConsentDocumentKey" NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" "AppLocale" NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "guardianName" TEXT,
    "guardianRelation" TEXT,
    "guardianVerifiedAt" TIMESTAMP(3),
    "guardianVerifiedById" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_documentKey_version_idx" ON "ConsentRecord"("userId", "documentKey", "version");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_acceptedAt_idx" ON "ConsentRecord"("userId", "acceptedAt");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_guardianVerifiedById_fkey" FOREIGN KEY ("guardianVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

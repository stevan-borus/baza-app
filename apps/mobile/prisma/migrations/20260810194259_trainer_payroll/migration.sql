-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'LOCKED');

-- CreateTable
CREATE TABLE "TrainerRate" (
    "id" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "TrainerRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "percent" INTEGER,
    "grossAmount" INTEGER,
    "payoutAmount" INTEGER,
    "lockedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sessionId" TEXT,
    "sessionStartsAt" TIMESTAMP(3) NOT NULL,
    "classTypeName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "sessionValue" INTEGER NOT NULL,
    "isGift" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerRate_trainerUserId_effectiveFrom_idx" ON "TrainerRate"("trainerUserId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayrollPeriod_periodStart_idx" ON "PayrollPeriod"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_trainerUserId_periodStart_key" ON "PayrollPeriod"("trainerUserId", "periodStart");

-- CreateIndex
CREATE INDEX "PayrollLine_periodId_idx" ON "PayrollLine"("periodId");

-- CreateIndex
CREATE INDEX "PayrollLine_sessionId_idx" ON "PayrollLine"("sessionId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_periodId_idx" ON "PayrollAdjustment"("periodId");

-- AddForeignKey
ALTER TABLE "TrainerRate" ADD CONSTRAINT "TrainerRate_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerRate" ADD CONSTRAINT "TrainerRate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_lockedByUserId_fkey" FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

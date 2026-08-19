-- DropIndex
DROP INDEX "TrainerRate_trainerUserId_effectiveFrom_seq_idx";

-- AlterTable
ALTER TABLE "TrainerRate" ADD COLUMN     "classTypeId" TEXT,
ALTER COLUMN "percent" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "TrainerRate_trainerUserId_classTypeId_effectiveFrom_seq_idx" ON "TrainerRate"("trainerUserId", "classTypeId", "effectiveFrom", "seq");

-- AddForeignKey
ALTER TABLE "TrainerRate" ADD CONSTRAINT "TrainerRate_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

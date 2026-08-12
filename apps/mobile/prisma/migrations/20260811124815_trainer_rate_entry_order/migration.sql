-- DropIndex
DROP INDEX "TrainerRate_trainerUserId_effectiveFrom_idx";

-- AlterTable
ALTER TABLE "TrainerRate" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "TrainerRate_trainerUserId_effectiveFrom_seq_idx" ON "TrainerRate"("trainerUserId", "effectiveFrom", "seq");

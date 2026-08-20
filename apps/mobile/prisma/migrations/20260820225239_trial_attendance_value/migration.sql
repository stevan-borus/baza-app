-- AlterTable
ALTER TABLE "ClassType" ADD COLUMN     "trialSessionValue" INTEGER;

-- AlterTable
ALTER TABLE "SessionConsumption" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false;

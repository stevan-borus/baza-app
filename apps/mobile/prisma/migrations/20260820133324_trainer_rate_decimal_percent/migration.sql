/*
  Warnings:

  - You are about to alter the column `percent` on the `TrainerRate` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(5,2)`.

*/
-- AlterTable
ALTER TABLE "TrainerRate" ALTER COLUMN "percent" SET DATA TYPE DECIMAL(5,2);

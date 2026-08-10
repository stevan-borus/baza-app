/*
  Warnings:

  - You are about to drop the column `emptyBookingCutoffHours` on the `ClassType` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ClassType" DROP COLUMN "emptyBookingCutoffHours";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "emptyBookingCutoffHours" INTEGER NOT NULL DEFAULT 4;

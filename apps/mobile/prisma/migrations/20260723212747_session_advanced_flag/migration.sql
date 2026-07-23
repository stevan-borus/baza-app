/*
  Warnings:

  - You are about to drop the column `intensity` on the `Session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Session" DROP COLUMN "intensity",
ADD COLUMN     "isAdvanced" BOOLEAN NOT NULL DEFAULT false;

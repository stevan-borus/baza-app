/*
  Warnings:

  - You are about to drop the column `isAdvanced` on the `Session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Session" DROP COLUMN "isAdvanced",
ADD COLUMN     "isIntermediate" BOOLEAN NOT NULL DEFAULT false;

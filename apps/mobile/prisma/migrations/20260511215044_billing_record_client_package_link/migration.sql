/*
  Warnings:

  - A unique constraint covering the columns `[clientPackageId]` on the table `BillingRecord` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "BillingRecord" ADD COLUMN     "clientPackageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BillingRecord_clientPackageId_key" ON "BillingRecord"("clientPackageId");

-- AddForeignKey
ALTER TABLE "BillingRecord" ADD CONSTRAINT "BillingRecord_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

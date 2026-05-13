-- AlterTable
ALTER TABLE "BillingRecord" ADD COLUMN     "packageTypeId" TEXT;

-- CreateIndex
CREATE INDEX "BillingRecord_packageTypeId_idx" ON "BillingRecord"("packageTypeId");

-- AddForeignKey
ALTER TABLE "BillingRecord" ADD CONSTRAINT "BillingRecord_packageTypeId_fkey" FOREIGN KEY ("packageTypeId") REFERENCES "PackageType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

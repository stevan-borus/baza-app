/*
  Warnings:

  - Added the required column `classTypeId` to the `ClientPackage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lateCancelHours` to the `ClientPackage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `classTypeId` to the `PackageType` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ClientPackage" ADD COLUMN     "classTypeId" TEXT NOT NULL,
ADD COLUMN     "lateCancelHours" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "PackageType" ADD COLUMN     "classTypeId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ClientPackage_classTypeId_idx" ON "ClientPackage"("classTypeId");

-- CreateIndex
CREATE INDEX "ClientPackage_clientProfileId_classTypeId_idx" ON "ClientPackage"("clientProfileId", "classTypeId");

-- CreateIndex
CREATE INDEX "PackageType_classTypeId_idx" ON "PackageType"("classTypeId");

-- AddForeignKey
ALTER TABLE "PackageType" ADD CONSTRAINT "PackageType_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

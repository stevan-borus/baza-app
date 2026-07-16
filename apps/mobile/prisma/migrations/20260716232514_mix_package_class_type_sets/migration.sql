/*
  Mix packages (ADR-0010): PackageType / ClientPackage move from a single
  classTypeId column to explicit join tables holding a SET of ClassTypes.

  The generated statements are reordered so the join tables exist BEFORE the
  scalar columns are dropped, with INSERT…SELECT backfills in between — every
  existing row becomes a one-element set and no scoping data is lost.
*/
-- CreateTable
CREATE TABLE "PackageTypeClassType" (
    "packageTypeId" TEXT NOT NULL,
    "classTypeId" TEXT NOT NULL,

    CONSTRAINT "PackageTypeClassType_pkey" PRIMARY KEY ("packageTypeId","classTypeId")
);

-- CreateTable
CREATE TABLE "ClientPackageClassType" (
    "clientPackageId" TEXT NOT NULL,
    "classTypeId" TEXT NOT NULL,

    CONSTRAINT "ClientPackageClassType_pkey" PRIMARY KEY ("clientPackageId","classTypeId")
);

-- CreateIndex
CREATE INDEX "PackageTypeClassType_classTypeId_idx" ON "PackageTypeClassType"("classTypeId");

-- CreateIndex
CREATE INDEX "ClientPackageClassType_classTypeId_idx" ON "ClientPackageClassType"("classTypeId");

-- AddForeignKey
ALTER TABLE "PackageTypeClassType" ADD CONSTRAINT "PackageTypeClassType_packageTypeId_fkey" FOREIGN KEY ("packageTypeId") REFERENCES "PackageType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageTypeClassType" ADD CONSTRAINT "PackageTypeClassType_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackageClassType" ADD CONSTRAINT "ClientPackageClassType_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackageClassType" ADD CONSTRAINT "ClientPackageClassType_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing single-type row becomes a one-element set
INSERT INTO "PackageTypeClassType" ("packageTypeId", "classTypeId")
SELECT "id", "classTypeId" FROM "PackageType" WHERE "classTypeId" IS NOT NULL;

INSERT INTO "ClientPackageClassType" ("clientPackageId", "classTypeId")
SELECT "id", "classTypeId" FROM "ClientPackage" WHERE "classTypeId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "ClientPackage" DROP CONSTRAINT "ClientPackage_classTypeId_fkey";

-- DropForeignKey
ALTER TABLE "PackageType" DROP CONSTRAINT "PackageType_classTypeId_fkey";

-- DropIndex
DROP INDEX "ClientPackage_classTypeId_idx";

-- DropIndex
DROP INDEX "ClientPackage_clientProfileId_classTypeId_idx";

-- DropIndex
DROP INDEX "PackageType_classTypeId_idx";

-- AlterTable
ALTER TABLE "ClientPackage" DROP COLUMN "classTypeId";

-- AlterTable
ALTER TABLE "PackageType" DROP COLUMN "classTypeId";

-- CreateIndex
CREATE INDEX "ClientPackage_clientProfileId_idx" ON "ClientPackage"("clientProfileId");

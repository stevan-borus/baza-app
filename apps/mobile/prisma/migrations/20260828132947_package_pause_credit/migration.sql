-- CreateTable
CREATE TABLE "PackagePauseCredit" (
    "id" TEXT NOT NULL,
    "packagePauseId" TEXT NOT NULL,
    "clientPackageId" TEXT NOT NULL,
    "grantedMs" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagePauseCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagePauseCredit_clientPackageId_idx" ON "PackagePauseCredit"("clientPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "PackagePauseCredit_packagePauseId_clientPackageId_key" ON "PackagePauseCredit"("packagePauseId", "clientPackageId");

-- AddForeignKey
ALTER TABLE "PackagePauseCredit" ADD CONSTRAINT "PackagePauseCredit_packagePauseId_fkey" FOREIGN KEY ("packagePauseId") REFERENCES "PackagePause"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePauseCredit" ADD CONSTRAINT "PackagePauseCredit_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

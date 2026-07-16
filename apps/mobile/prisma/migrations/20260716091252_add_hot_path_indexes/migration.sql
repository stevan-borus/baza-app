-- CreateIndex
CREATE INDEX "BillingRecord_clientUserId_idx" ON "BillingRecord"("clientUserId");

-- CreateIndex
CREATE INDEX "BillingRecord_status_createdAt_idx" ON "BillingRecord"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_clientProfileId_idx" ON "Booking"("clientProfileId");

-- CreateIndex
CREATE INDEX "Booking_clientPackageId_idx" ON "Booking"("clientPackageId");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE INDEX "PackagePause_clientProfileId_idx" ON "PackagePause"("clientProfileId");

-- CreateIndex
CREATE INDEX "Session_roomId_startsAt_idx" ON "Session"("roomId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_endsAt_idx" ON "Session"("endsAt");

-- CreateIndex
CREATE INDEX "TrainerNote_trainerUserId_createdAt_idx" ON "TrainerNote"("trainerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WaitlistEntry_clientProfileId_idx" ON "WaitlistEntry"("clientProfileId");

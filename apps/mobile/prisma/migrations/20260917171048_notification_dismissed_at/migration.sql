-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "dismissedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "NotificationLog_userId_dismissedAt_idx" ON "NotificationLog"("userId", "dismissedAt");

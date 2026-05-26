-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'RESERVATION_UNBACKED_ATTENDANCE';
ALTER TYPE "NotificationType" ADD VALUE 'BULK_RESERVATION_CANCEL_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'BULK_RESERVATION_CANCEL_TRAINER';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_createdByUserId_idx" ON "Booking"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "waivedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_waivedByUserId_idx" ON "Booking"("waivedByUserId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_waivedByUserId_fkey" FOREIGN KEY ("waivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

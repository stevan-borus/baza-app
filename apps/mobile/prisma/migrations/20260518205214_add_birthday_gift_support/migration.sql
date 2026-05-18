-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY_ADMIN_PROMPT';
ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY_CLIENT_GIFT';

-- AlterTable
ALTER TABLE "PackageType" ADD COLUMN     "isBirthdayGift" BOOLEAN NOT NULL DEFAULT false;

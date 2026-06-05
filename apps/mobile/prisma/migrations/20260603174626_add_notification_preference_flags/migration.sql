-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "bookingEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "campaignsEnabled" BOOLEAN NOT NULL DEFAULT true;

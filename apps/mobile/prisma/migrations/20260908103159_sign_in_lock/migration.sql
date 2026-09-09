-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedSignInCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFailedSignInAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

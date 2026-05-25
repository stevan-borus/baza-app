/*
  Warnings:

  - You are about to drop the column `complaintsDetails` on the `ClientHealthIntake` table. All the data in the column will be lost.
  - You are about to drop the column `hasComplaints` on the `ClientHealthIntake` table. All the data in the column will be lost.
  - You are about to drop the column `hasInjuries` on the `ClientHealthIntake` table. All the data in the column will be lost.
  - You are about to drop the column `injuriesDetails` on the `ClientHealthIntake` table. All the data in the column will be lost.
  - You are about to drop the column `isFirstPilates` on the `ClientHealthIntake` table. All the data in the column will be lost.
  - You are about to drop the column `isPhysicallyActive` on the `ClientHealthIntake` table. All the data in the column will be lost.
  - You are about to drop the column `isPostpartum` on the `ClientHealthIntake` table. All the data in the column will be lost.
  - You are about to drop the column `isPregnant` on the `ClientHealthIntake` table. All the data in the column will be lost.
  - Added the required column `activityLevel` to the `ClientHealthIntake` table without a default value. This is not possible if the table is not empty.
  - Added the required column `exerciseFrequency` to the `ClientHealthIntake` table without a default value. This is not possible if the table is not empty.
  - Added the required column `underMedicalTreatment` to the `ClientHealthIntake` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ClientHealthIntake" DROP COLUMN "complaintsDetails",
DROP COLUMN "hasComplaints",
DROP COLUMN "hasInjuries",
DROP COLUMN "injuriesDetails",
DROP COLUMN "isFirstPilates",
DROP COLUMN "isPhysicallyActive",
DROP COLUMN "isPostpartum",
DROP COLUMN "isPregnant",
ADD COLUMN     "activityLevel" TEXT NOT NULL,
ADD COLUMN     "additionalNotes" TEXT,
ADD COLUMN     "conditions" TEXT[],
ADD COLUMN     "conditionsOther" TEXT,
ADD COLUMN     "discomfortDuring" TEXT[],
ADD COLUMN     "exerciseFrequency" TEXT NOT NULL,
ADD COLUMN     "goals" TEXT[],
ADD COLUMN     "goalsOther" TEXT,
ADD COLUMN     "medicalTreatmentDetails" TEXT,
ADD COLUMN     "pilatesExperience" TEXT[],
ADD COLUMN     "pilatesExperienceDuration" TEXT,
ADD COLUMN     "underMedicalTreatment" BOOLEAN NOT NULL;

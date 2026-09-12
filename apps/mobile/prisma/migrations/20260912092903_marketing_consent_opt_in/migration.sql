-- AlterEnum
ALTER TYPE "ConsentDocumentKey" ADD VALUE 'marketing';

-- AlterTable
ALTER TABLE "NotificationPreference" ALTER COLUMN "campaignsEnabled" SET DEFAULT false;

-- Revoke the un-consented population.
--
-- Every existing `true` came from the old opt-out column default, not from a
-- „jasna potvrdna radnja” (ZZPL čl. 4(1)(12)). Zakon o elektronskoj trgovini
-- čl. 8 requires PRIOR consent and Serbian law has no soft opt-in, so these
-- clients were never lawfully enrolled and cannot be grandfathered. They
-- re-opt-in through the consent gate or profile settings.
--
-- Deliberately unconditional rather than "only rows with no ConsentRecord":
-- the marketing key does not exist before this migration, so no row can have
-- one, and a conditional would only look more careful than it is.
UPDATE "NotificationPreference" SET "campaignsEnabled" = false;

-- Backfill BillingRecord.clientPackageId for legacy CONFIRMED rows that
-- predate the @unique FK. Pairs each unlinked CONFIRMED BillingRecord
-- with the ClientPackage it most likely funded, using the same
-- (packageType, chronological-order) zip the legacy
-- `matchBillingToPackages` read-time helper uses.
--
-- This replaces scripts/backfill/billing-client-package-link.ts (deleted).
-- Promoting it into a migration means every environment runs it exactly
-- once via `prisma migrate deploy` — no separate "remember to run the
-- backfill" ops step.
--
-- Idempotent by construction:
--   - Only touches rows where clientPackageId IS NULL.
--   - Excludes packages already claimed via the @unique FK (so an earlier
--     run, manual fix, or a re-deploy on an already-migrated DB is a no-op).
--   - Within each (clientUserId, packageTypeId) bucket, pairs by parallel
--     ASC rank (billing.createdAt, package.startsAt), tie-breaking by id.
--   - Pairs at most min(len(billing), len(packages)) rows per bucket — extra
--     billing rows or extra packages on either side are left untouched.

WITH ranked_billing AS (
  SELECT
    id,
    "clientUserId",
    "packageTypeId",
    ROW_NUMBER() OVER (
      PARTITION BY "clientUserId", "packageTypeId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "BillingRecord"
  WHERE "clientPackageId" IS NULL
    AND status = 'CONFIRMED'
    AND "packageTypeId" IS NOT NULL
),
unclaimed_packages AS (
  SELECT
    cp.id AS package_id,
    cp."packageTypeId",
    prof."userId" AS client_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY prof."userId", cp."packageTypeId"
      ORDER BY cp."startsAt" ASC, cp.id ASC
    ) AS rn
  FROM "ClientPackage" cp
  JOIN "ClientProfile" prof ON prof.id = cp."clientProfileId"
  WHERE NOT EXISTS (
    SELECT 1
    FROM "BillingRecord" b
    WHERE b."clientPackageId" = cp.id
  )
)
UPDATE "BillingRecord" br
SET "clientPackageId" = up.package_id
FROM ranked_billing rb
JOIN unclaimed_packages up
  ON up.client_user_id = rb."clientUserId"
  AND up."packageTypeId" = rb."packageTypeId"
  AND up.rn = rb.rn
WHERE br.id = rb.id;

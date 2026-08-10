-- Data migration: point legacy gift packages at a REAL, priced package type.
--
-- Gifts used to be their own unpriced 1-session SKUs, which made a gifted
-- session unvaluable — the trainer would have been paid nothing for work they
-- actually did. Gifts are now a flag on a real package (isGift), so these rows
-- have to be repointed or they stay worth zero forever.
--
-- The replacement is the package clients on that class type ACTUALLY buy most
-- often — i.e. the priced package covering the gift's own snapshotted class
-- type with the most sold ClientPackages, ties broken by the higher session
-- count (the studio's headline package) and then by id for determinism.
--
-- "Most-used" rather than cheapest or most-expensive: cheapest picks whichever
-- cross-brand package happens to also cover the class type (a Reformer gift
-- would be valued at the Energy rate), and most-expensive picks the
-- personal-training rate for a group session. Neither describes what the gift
-- stood in for. Matching on the package's own snapshot rather than hardcoding
-- a SKU keeps this correct in every environment.
--
-- sessionsGranted is left untouched: a 1-session gift stays one session and is
-- now valued at that package's per-session rate.

UPDATE "ClientPackage" cp
SET "isGift" = true,
    "packageTypeId" = replacement.id
FROM (
  SELECT
    cpct."clientPackageId" AS client_package_id,
    (
      SELECT pt2.id
      FROM "PackageType" pt2
      JOIN "PackageTypeClassType" ptct2 ON ptct2."packageTypeId" = pt2.id
      WHERE ptct2."classTypeId" = cpct."classTypeId"
        AND pt2.price IS NOT NULL
        AND pt2."sessionCount" > 0
      ORDER BY
        (
          SELECT count(*)
          FROM "ClientPackage" sold
          WHERE sold."packageTypeId" = pt2.id
        ) DESC,
        pt2."sessionCount" DESC,
        pt2.id ASC
      LIMIT 1
    ) AS id
  FROM "ClientPackageClassType" cpct
) AS replacement
WHERE replacement.client_package_id = cp.id
  AND replacement.id IS NOT NULL
  AND cp."packageTypeId" IN (
    SELECT id FROM "PackageType" WHERE price IS NULL
  );

-- Any gift whose class type has no priced package at all keeps its old SKU and
-- is reported as "unpriced" on the payroll period, which is the honest
-- outcome: it needs an admin decision, not a guessed price.

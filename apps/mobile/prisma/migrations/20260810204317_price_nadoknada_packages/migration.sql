-- Data migration: give the unpriced make-up ("Nadoknada") SKUs a price.
--
-- These are 1-session packages handed out when a client makes up a missed
-- training. Unpriced, they contribute nothing to the trainer's payout — the
-- trainer taught the session and would be paid zero for it.
--
-- The price is the per-session rate of the package clients ACTUALLY buy most
-- among those covering the same class types, so a make-up training is worth
-- what a normal one is worth. Most-used rather than cheapest: a class type is
-- served by several packages, and taking the minimum would price a Reformer
-- make-up at the Energy rate simply because Energy also covers reformer.
--
-- Note these SKUs cover MORE THAN ONE class type (the reformer make-up covers
-- both reformer rooms; the energy one also covers reformer), so the reference
-- is chosen across the SKU's whole covered set rather than from one arbitrary
-- member of it. Picking "the first class type by id" would make the price
-- depend on uuid ordering — a different answer per environment.
--
-- Applied only where the row is still unpriced, so a studio that has set its
-- own price keeps it. Birthday-gift rows are NOT touched: gifting now assigns
-- a real priced package (isGift), so those SKUs are being retired, not priced.

UPDATE "PackageType" target
SET price = (
  SELECT round(pt.price::numeric / pt."sessionCount")::int * target."sessionCount"
  FROM "PackageType" pt
  WHERE pt.price IS NOT NULL
    AND pt."sessionCount" > 0
    AND pt."isBirthdayGift" = false
    AND pt."isSystem" = false
    AND EXISTS (
      -- Shares at least one class type with the make-up SKU.
      SELECT 1
      FROM "PackageTypeClassType" a
      JOIN "PackageTypeClassType" b ON b."classTypeId" = a."classTypeId"
      WHERE a."packageTypeId" = pt.id
        AND b."packageTypeId" = target.id
    )
  ORDER BY
    (SELECT count(*) FROM "ClientPackage" sold WHERE sold."packageTypeId" = pt.id) DESC,
    pt."sessionCount" DESC,
    pt.id ASC
  LIMIT 1
)
WHERE target.price IS NULL
  AND target."isBirthdayGift" = false
  AND target."isSystem" = false
  AND target."sessionCount" > 0
  -- Only when a priced reference actually exists; otherwise leave it unpriced
  -- so payroll reports it rather than inventing a number.
  AND EXISTS (
    SELECT 1
    FROM "PackageType" pt
    WHERE pt.price IS NOT NULL
      AND pt."sessionCount" > 0
      AND pt."isBirthdayGift" = false
      AND pt."isSystem" = false
      AND EXISTS (
        SELECT 1
        FROM "PackageTypeClassType" a
        JOIN "PackageTypeClassType" b ON b."classTypeId" = a."classTypeId"
        WHERE a."packageTypeId" = pt.id
          AND b."packageTypeId" = target.id
      )
  );

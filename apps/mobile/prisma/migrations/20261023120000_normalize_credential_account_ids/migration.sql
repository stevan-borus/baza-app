-- Better Auth 1.7 requires credential accountId = userId. Preserve each row
-- and its password hash; deploy this server migration before client updates.
DO $$
BEGIN
  LOCK TABLE "AuthAccount" IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (
    SELECT "userId"
    FROM "AuthAccount"
    WHERE "providerId" = 'credential'
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize credential account IDs: multiple credential rows for a user';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AuthAccount" source
    JOIN "AuthAccount" target
      ON target."providerId" = 'credential'
      AND target."accountId" = source."userId"
      AND target.id <> source.id
    WHERE source."providerId" = 'credential'
  ) THEN
    RAISE EXCEPTION 'Cannot normalize credential account IDs: target account ID belongs to another credential row';
  END IF;

  UPDATE "AuthAccount"
  SET "accountId" = "userId"
  WHERE "providerId" = 'credential'
    AND "accountId" <> "userId";
END $$;

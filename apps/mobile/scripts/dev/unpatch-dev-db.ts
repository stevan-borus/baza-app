/**
 * One-shot cleanup for the local DEV database.
 *
 * Historically, `pnpm test:e2e:prepare` ran `patch-test-db.ts` against
 * `baza_app` — the same database the dev Prisma client uses. The patch
 * adds DB-side `gen_random_uuid()` defaults on every `id` column and
 * `CURRENT_TIMESTAMP` defaults on every `updatedAt` column. These don't
 * live in any migration, so `prisma migrate dev` reports drift on every
 * such column.
 *
 * After this PR, test prep only touches `baza_app_test`, so dev DB will
 * never re-acquire that drift. But existing local dev DBs are already
 * polluted. This script drops the unmanaged defaults so `prisma migrate
 * dev` is clean again, *without* losing any of your local data.
 *
 * Run once:
 *   pnpm --filter mobile dev:db:unpatch
 *
 * Idempotent: safe to re-run.
 */
import { Pool } from "pg";

const DEV_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/baza_app?schema=public";

const schemaName = new URL(DEV_URL).searchParams.get("schema")?.trim() || "public";

const sql = `
DO $$
DECLARE
  record_item RECORD;
BEGIN
  FOR record_item IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = '${schemaName}'
      AND column_name = 'id'
      AND data_type = 'text'
      AND column_default LIKE '%gen_random_uuid%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN "id" DROP DEFAULT',
      '${schemaName}',
      record_item.table_name
    );
  END LOOP;

  FOR record_item IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = '${schemaName}'
      AND column_name = 'updatedAt'
      AND column_default LIKE '%CURRENT_TIMESTAMP%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN "updatedAt" DROP DEFAULT',
      '${schemaName}',
      record_item.table_name
    );
  END LOOP;
END $$;
`;

async function main() {
  if (DEV_URL.includes("baza_app_test")) {
    throw new Error(
      "Refusing to unpatch a *_test database. Run only against the dev DB (default: baza_app).",
    );
  }
  const pool = new Pool({ connectionString: DEV_URL });
  try {
    await pool.query(sql);
    console.log(`[unpatch-dev-db] Stripped patch-injected defaults from ${schemaName}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[unpatch-dev-db] Failed:", error);
  process.exitCode = 1;
});

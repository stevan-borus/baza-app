import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for patch-test-db");
}

const parsedUrl = new URL(databaseUrl);
const dbName = parsedUrl.pathname.replace(/^\//, "");
// Guardrail: this script adds DB-side defaults that are NOT in any Prisma
// migration, so `migrate dev` will report drift on whatever DB it touches.
// Restrict it to *_test databases so dev never re-acquires that drift again.
// (Pre-PR this script ran against `baza_app` and silently polluted dev DBs.)
if (!dbName.endsWith("_test") && process.env.FORCE_PATCH !== "1") {
  throw new Error(
    `patch-test-db refuses to run against "${dbName}". Database name must end in "_test" ` +
      `(set FORCE_PATCH=1 to override — only use if you understand the drift consequences).`,
  );
}

const pool = new Pool({ connectionString: databaseUrl });

const schemaName = parsedUrl.searchParams.get("schema")?.trim() || "public";

const sql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text',
      '${schemaName}',
      record_item.table_name
    );
  END LOOP;

  FOR record_item IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = '${schemaName}'
      AND column_name = 'updatedAt'
      AND data_type IN ('timestamp without time zone', 'timestamp with time zone')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP',
      '${schemaName}',
      record_item.table_name
    );
  END LOOP;
END $$;
`;

async function main() {
  await pool.query(sql);
}

main()
  .catch((error) => {
    console.error("[patch-test-db] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for patch-test-db");
}

const pool = new Pool({ connectionString: databaseUrl });

const schemaName =
  new URL(databaseUrl).searchParams.get("schema")?.trim() || "public";

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

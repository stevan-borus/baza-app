/**
 * Idempotently ensures the `baza_app_test` database exists on the local
 * Postgres instance.
 *
 * Why this exists: docker-compose's init.sql only runs when the data volume
 * is being created from scratch. Existing contributors whose volume already
 * has `baza_app` won't get `baza_app_test` automatically — they run this once.
 *
 * Connects to the maintenance `postgres` database to issue CREATE DATABASE.
 * No-ops if the target DB already exists.
 */
import { Pool } from "pg";

const ADMIN_URL = "postgresql://postgres:postgres@localhost:5434/postgres";
const TEST_DB_NAME = "baza_app_test";

async function main() {
  const pool = new Pool({ connectionString: ADMIN_URL });
  try {
    const exists = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DB_NAME],
    );
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`[bootstrap-test-db] ${TEST_DB_NAME} already exists — no-op`);
      return;
    }
    // pg parameterizes values, not identifiers — but TEST_DB_NAME is a
    // hard-coded constant so direct interpolation is safe here.
    await pool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    console.log(`[bootstrap-test-db] Created ${TEST_DB_NAME}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[bootstrap-test-db] Failed:", error);
  process.exitCode = 1;
});

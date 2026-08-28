/**
 * Local-only: give every account in the local dev DB the same password.
 *
 * Restoring a staging dump into localhost brings real password hashes nobody
 * knows, which makes the copied data impossible to sign in to. This resets
 * them all to one dev password. Guarded to localhost so it can never touch a
 * deployed database.
 */
import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "../../lib/server/password";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error("Refusing to run: DATABASE_URL is not localhost.");
  }
  const password = process.env.LOCAL_DEV_PASSWORD;
  if (!password) throw new Error("LOCAL_DEV_PASSWORD is required.");

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const hash = await hashPassword(password);
    const { count } = await prisma.authAccount.updateMany({
      where: { providerId: "credential" },
      data: { password: hash },
    });
    console.log(`Updated ${count} credential accounts.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/password";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";

const PASSWORD = "TacnaSifra123!";
const migrationSql = readFileSync(
  new URL(
    "../../prisma/migrations/20261023120000_normalize_credential_account_ids/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createCredentialUser(email: string, canonical = false) {
  const password = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      firstName: "Ana",
      lastName: "Petrović",
      role: "ADMIN",
      passwordHash: password,
      emailVerified: true,
    },
  });
  const account = await prisma.authAccount.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: canonical ? user.id : user.email,
      password,
    },
  });
  return { user, account };
}

describe("credential account ID migration", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
    await pool.end();
  });

  it("restores legacy password sign-in while preserving credentials and OAuth accounts", async () => {
    const legacy = await createCredentialUser("legacy@test.local");
    const canonical = await createCredentialUser("canonical@test.local", true);
    const oauth = await prisma.authAccount.create({
      data: {
        userId: legacy.user.id,
        providerId: "google",
        accountId: legacy.user.id,
        accessToken: "preserved-oauth-token",
      },
    });

    await pool.query(migrationSql);

    const response = await auth.handler(
      new Request("http://test.local/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: legacy.user.email, password: PASSWORD }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };
    expect(body.user.id).toBe(legacy.user.id);

    const accounts = await prisma.authAccount.findMany({ orderBy: { id: "asc" } });
    expect(accounts).toHaveLength(3);
    expect(accounts).toEqual(
      expect.arrayContaining([
        { ...legacy.account, accountId: legacy.user.id },
        canonical.account,
        oauth,
      ]),
    );

    await pool.query(migrationSql);
    expect(await prisma.authAccount.findMany({ orderBy: { id: "asc" } })).toEqual(accounts);
  });

  it("refuses duplicate credential rows for a user without changing any accounts", async () => {
    await createCredentialUser("unaffected@test.local");
    const { user, account } = await createCredentialUser("duplicate@test.local");
    await prisma.authAccount.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: "another-credential-key",
        password: account.password,
      },
    });
    const before = await prisma.authAccount.findMany({ orderBy: { id: "asc" } });

    await expect(pool.query(migrationSql)).rejects.toThrow(
      "Cannot normalize credential account IDs: multiple credential rows for a user",
    );
    expect(await prisma.authAccount.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("refuses an account ID held by another user's credential without changing any accounts", async () => {
    const legacy = await createCredentialUser("legacy@test.local");
    const other = await createCredentialUser("other@test.local");
    await prisma.authAccount.update({
      where: { id: other.account.id },
      data: { accountId: legacy.user.id },
    });
    const before = await prisma.authAccount.findMany({ orderBy: { id: "asc" } });

    await expect(pool.query(migrationSql)).rejects.toThrow(
      "Cannot normalize credential account IDs: target account ID belongs to another credential row",
    );
    expect(await prisma.authAccount.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });
});

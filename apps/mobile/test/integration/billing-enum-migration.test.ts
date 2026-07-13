/**
 * Integration test: post-migration shape of BillingRecord.
 *
 * PR β trimmed the BillingMethod and BillingStatus Postgres enums:
 *   - BillingMethod.QR removed (data migrated to CASH)
 *   - BillingStatus.PENDING + CANCELED removed (data migrated to CONFIRMED)
 *
 * The pay-later/revoke branch then REINTRODUCED PENDING (pay-later assigns)
 * and added VOIDED (revoked packages) — but NOT CANCELED, which stays dead.
 *
 * The migrations themselves run when the DB is reset via
 * `pnpm test:db:prepare`; this suite asserts the post-migration enum
 * constraints — i.e. the DB REJECTS writes with the dropped values (QR,
 * CANCELED) and ACCEPTS the live set (CONFIRMED, PENDING, VOIDED), so any
 * test or seeder that drifts will fail loudly rather than silently
 * producing a row in a state the UI can't render.
 *
 * The "data-safety" half of the migration (QR rows -> CASH,
 * PENDING/CANCELED -> CONFIRMED) is asserted by the SQL itself; verifying
 * a fresh empty DB has no QR rows would be vacuous.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";

describe("billing enum migration (PR β schema trim)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("rejects BillingRecord writes with method=QR", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
    });
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "BillingRecord" ("id", "clientUserId", "amount", "method", "status", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), '${client.id}', 100, 'QR', 'CONFIRMED', NOW(), NOW())`,
      ),
    ).rejects.toThrow();
  });

  it("accepts BillingRecord writes with status=PENDING and VOIDED (pay-later/revoke)", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
    });
    for (const status of ["PENDING", "VOIDED"] as const) {
      await prisma.billingRecord.create({
        data: { clientUserId: client.id, amount: 100, method: "CASH", status },
      });
    }
    expect(await prisma.billingRecord.count()).toBe(2);
  });

  it("rejects BillingRecord writes with status=CANCELED", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
    });
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "BillingRecord" ("id", "clientUserId", "amount", "method", "status", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), '${client.id}', 100, 'CASH', 'CANCELED', NOW(), NOW())`,
      ),
    ).rejects.toThrow();
  });

  it("accepts all four remaining PaymentMethod values + CONFIRMED status", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
    });
    for (const method of ["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"] as const) {
      await prisma.billingRecord.create({
        data: {
          clientUserId: client.id,
          amount: 100,
          method,
          status: "CONFIRMED",
        },
      });
    }
    expect(await prisma.billingRecord.count()).toBe(4);
  });
});

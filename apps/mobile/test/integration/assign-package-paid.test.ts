// P2-5: Cover the "Option 2" surface used by the paid-mode assign sheet.
//
// The atomic create + rollback semantics of POST /api/billing are already
// covered by billing-post.test.ts (no need to duplicate). The new thing
// P2-5 introduced is that the UI relies on the BillingRecord ↔
// ClientPackage pair created inside the same Prisma $transaction. This
// test pins the correlation tuple — same clientUserId/packageTypeId, both
// rows stamped at the anchor instant — so a future refactor can't
// silently break the "this payment funded that package" lookup.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";
import { now } from "@/lib/now";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role)) return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

import { POST } from "@/app/api/billing/+api";
import { prisma } from "@/lib/server/prisma";

async function seed() {
  const adminUser = await prisma.user.create({
    data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@test.local", fullName: "Client", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: clientUser.id },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 8",
      sessionCount: 8,
      validityDays: 60,
      lateCancelHours: 12,
      classTypeId: classType.id,
    },
  });
  return { adminUser, clientUser, clientProfile, classType, packageType };
}

function buildJsonRequest(body: unknown) {
  return new Request("http://test.local/api/billing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("assign-package paid mode (POST /api/billing)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("paid mode: BillingRecord + ClientPackage share clientUserId/packageTypeId and are co-stamped on the anchor instant", async () => {
    const { adminUser, clientUser, clientProfile, packageType } = await seed();
    setMockUser({
      id: adminUser.id,
      role: "ADMIN",
      email: adminUser.email,
      isActive: true,
      clientProfile: null,
    });

    const anchor = now().getTime();
    const res = await POST(
      buildJsonRequest({
        clientUserId: clientUser.id,
        amount: 24000,
        method: "CARD",
        packageTypeId: packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(res.status).toBe(201);

    // The two rows that share the correlation tuple.
    const records = await prisma.billingRecord.findMany();
    expect(records).toHaveLength(1);
    const packs = await prisma.clientPackage.findMany();
    expect(packs).toHaveLength(1);

    const record = records[0]!;
    const pack = packs[0]!;

    // (a) Same client (BillingRecord stores User id; ClientPackage stores
    //     ClientProfile id — both must resolve to the same client).
    expect(record.clientUserId).toBe(clientUser.id);
    expect(pack.clientProfileId).toBe(clientProfile.id);

    // (b) Same packageType. BillingRecord now carries a nullable FK to
    //     PackageType — assert it matches the ClientPackage's FK so the
    //     "which payment funded this package" query is well-defined.
    expect(record.packageTypeId).toBe(packageType.id);
    expect(pack.packageTypeId).toBe(packageType.id);

    // (c) Package startsAt is pinned to the anchor instant (the server
    //     uses `now()`), so the two rows land on the same logical clock
    //     tick inside the transaction.
    expect(pack.startsAt.getTime()).toBe(anchor);

    // (d) Amount + method are persisted exactly as submitted by the UI.
    expect(record.amount).toBe(24000);
    expect(record.method).toBe("CARD");
    expect(record.status).toBe("CONFIRMED");

    // (e) Package sessions seeded from the PackageType snapshot.
    expect(pack.sessionsRemaining).toBe(8);
  });

  it("paid mode: rejects negative amount and creates neither row", async () => {
    const { adminUser, clientUser, packageType } = await seed();
    setMockUser({
      id: adminUser.id,
      role: "ADMIN",
      email: adminUser.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await POST(
      buildJsonRequest({
        clientUserId: clientUser.id,
        amount: -100,
        method: "CASH",
        packageTypeId: packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(res.status).toBe(400);
    const records = await prisma.billingRecord.findMany();
    expect(records).toHaveLength(0);
    const packs = await prisma.clientPackage.findMany();
    expect(packs).toHaveLength(0);
  });
});

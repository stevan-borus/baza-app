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

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { POST } from "@/server/routes/billing";
import { GET as GET_CLIENT_PACKAGES, POST as POST_CLIENT_PACKAGE } from "@/server/routes/packages/client-packages";
import { prisma } from "@/lib/server/prisma";

async function seed() {
  const adminUser = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "User", role: "CLIENT" },
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

  it("GET /api/packages/client-packages?clientProfileId attaches billingRecord to paid packages and null to comp packages", async () => {
    const { adminUser, clientUser, clientProfile, packageType } = await seed();
    setMockUser({
      id: adminUser.id,
      role: "ADMIN",
      email: adminUser.email,
      isActive: true,
      clientProfile: null,
    });

    // 1) Paid package — goes through POST /api/billing with
    //    activatePackageOnConfirm: true. The server uses now() for both
    //    the BillingRecord.createdAt and the ClientPackage.startsAt, so
    //    they share a logical clock tick and are the first of each type.
    const paidRes = await POST(
      buildJsonRequest({
        clientUserId: clientUser.id,
        amount: 32000,
        method: "CARD",
        packageTypeId: packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(paidRes.status).toBe(201);

    // 2) Comp package — created later (startsAt one hour ahead) via the
    //    plain POST /api/packages/client-packages, no billing row. After
    //    chronological zipping the paid package (older startsAt) pairs
    //    with the only BillingRecord; the comp package (newer startsAt,
    //    no record at index 1) stays unpaired.
    const compRes = await POST_CLIENT_PACKAGE(
      new Request("http://test.local/api/packages/client-packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientProfileId: clientProfile.id,
          packageTypeId: packageType.id,
          startsAt: new Date(now().getTime() + 60 * 60 * 1000).toISOString(),
        }),
      }),
    );
    expect(compRes.status).toBe(201);

    // Sanity: two ClientPackages, one BillingRecord.
    const allPacks = await prisma.clientPackage.findMany({
      orderBy: { startsAt: "asc" },
    });
    expect(allPacks).toHaveLength(2);
    const paidPackId = allPacks[0]!.id;
    const compPackId = allPacks[1]!.id;

    // Hit the GET endpoint and inspect billingRecord per package.
    const getRes = await GET_CLIENT_PACKAGES(
      new Request(
        `http://test.local/api/packages/client-packages?clientProfileId=${clientProfile.id}`,
      ),
    );
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as {
      success: boolean;
      packages: Array<{
        id: string;
        billingRecord: {
          amount: number;
          method: string;
          status?: string;
        } | null;
      }>;
    };
    expect(body.success).toBe(true);
    expect(body.packages).toHaveLength(2);

    const byId = new Map(body.packages.map((p) => [p.id, p]));
    expect(byId.get(compPackId)?.billingRecord).toBeNull();
    // The pay-later branch widened the embedded record with id + status; a
    // regular paid activation reads CONFIRMED.
    expect(byId.get(paidPackId)?.billingRecord).toMatchObject({
      amount: 32000,
      method: "CARD",
      status: "CONFIRMED",
    });
  });

  it("populates billingRecord.clientPackageId atomically on paid activation", async () => {
    // After the FK migration the BillingRecord row written inside the
    // activatePackageOnConfirm transaction must point at the ClientPackage
    // it just activated. The @unique constraint enforces 1:1 — read it back
    // from both sides to confirm.
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
        amount: 18000,
        method: "CASH",
        packageTypeId: packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      payment: { id: string };
      clientPackage: { id: string };
    };
    const billingId = json.payment.id;
    const packageId = json.clientPackage.id;

    // Forward direction: BillingRecord.clientPackageId points at the package.
    const billing = await prisma.billingRecord.findUnique({
      where: { id: billingId },
      select: { clientPackageId: true },
    });
    expect(billing?.clientPackageId).toBe(packageId);

    // Reverse direction via the @unique index: looking up by clientPackageId
    // resolves to exactly the BillingRecord we created.
    const linkedBilling = await prisma.billingRecord.findUnique({
      where: { clientPackageId: packageId },
      select: { id: true },
    });
    expect(linkedBilling?.id).toBe(billingId);
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

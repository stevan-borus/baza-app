import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET, POST } from "@/app/api/billing/+api";
import { POST as POST_CLIENT_PACK } from "@/app/api/packages/client-packages/+api";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";

async function seedAdminClientPackageType() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const client = await prisma.user.create({
    data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: client.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  return { admin, client, profile, packageType, reformer };
}

function asAdmin(admin: { id: string; email: string }) {
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
}

function asClient() {
  setMockUser({
    id: "client-1",
    role: "CLIENT",
    email: "client@test.local",
    isActive: true,
    clientProfile: { id: "p-1" },
  });
}

describe("billing extras", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("POST creates BillingRecord without ClientPackage when activatePackageOnConfirm is false", async () => {
    const { admin, client, packageType } = await seedAdminClientPackageType();
    asAdmin(admin);
    const response = await POST(
      new Request("http://test.local/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientUserId: client.id,
          amount: 12000,
          method: "CASH",
          status: "CONFIRMED",
          packageTypeId: packageType.id,
          activatePackageOnConfirm: false,
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await prisma.clientPackage.count()).toBe(0);
    expect(await prisma.billingRecord.count()).toBe(1);
  });

  // The previous test here asserted the API DOES NOT activate the package
  // when status=PENDING. PR β removed PENDING + CANCELED from BillingStatus
  // (the studio's workflow only ever produces CONFIRMED rows), so the
  // "status guards activation" branch is no longer reachable. The Flow-1-
  // with-activation path is still covered by the assign-package-paid.test.ts
  // suite and the e2e admin.spec.ts billing creation test.

  it("Flow 2: admin assigns a comp pack via /packages/client-packages with NO BillingRecord side-effect", async () => {
    const { admin, profile, packageType } = await seedAdminClientPackageType();
    asAdmin(admin);
    const response = await POST_CLIENT_PACK(
      new Request("http://test.local/api/packages/client-packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientProfileId: profile.id,
          packageTypeId: packageType.id,
          startsAt: now().toISOString(),
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await prisma.clientPackage.count()).toBe(1);
    // The comp-assign path is distinct from billing — no BillingRecord must be
    // created as a side effect of /packages/client-packages.
    expect(await prisma.billingRecord.count()).toBe(0);
  });

  it("GET as admin returns BillingRecords newest-first with cursor pagination", async () => {
    const { admin, client } = await seedAdminClientPackageType();
    const baseTime = nowMs();
    for (let i = 0; i < 3; i++) {
      await prisma.billingRecord.create({
        data: {
          clientUserId: client.id,
          amount: 1000 + i,
          method: "CASH",
          status: "CONFIRMED",
          createdAt: new Date(baseTime + i * 1000),
        },
      });
    }
    asAdmin(admin);
    const response = await GET(
      new Request("http://test.local/api/billing?take=2"),
    );
    const body = (await response.json()) as {
      records: { amount: number }[];
      nextCursor: string | null;
    };
    expect(body.records).toHaveLength(2);
    // Newest first → amounts 1002 then 1001.
    expect(body.records[0].amount).toBe(1002);
    expect(body.records[1].amount).toBe(1001);
    expect(body.nextCursor).not.toBeNull();
  });

  it("GET is forbidden for non-admin callers", async () => {
    asClient();
    const response = await GET(new Request("http://test.local/api/billing?take=10"));
    expect(response.status).toBe(403);
  });
});

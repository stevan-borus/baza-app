import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/packages/client-packages";
import { prisma } from "@/lib/server/prisma";

/**
 * Gifting a REAL package (see the payroll work): instead of maintaining
 * unpriced 1-session gift SKUs, an admin assigns an existing priced package
 * and flags it as a gift. That keeps the package's real price and session
 * count available for trainer-payout valuation, while `sessionsGranted`
 * defaults the gift to a single session rather than handing over all 12.
 */

async function seedAdminAndClient() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
  const clientUser = await prisma.user.create({
    data: {
      email: "client@test.local",
      firstName: "Client",
      lastName: "User",
      role: "CLIENT",
      clientProfile: { create: {} },
    },
    select: { id: true, clientProfile: { select: { id: true } } },
  });
  return { admin, clientProfileId: clientUser.clientProfile!.id };
}

async function seedPaidPackageType() {
  const classType = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      price: 15000,
      classTypes: { create: { classTypeId: classType.id } },
    },
  });
}

function buildAssignRequest(body: unknown) {
  return new Request("http://test.local/api/packages/client-packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("assign an existing package as a gift", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("grants ONE session by default, not the package's full count", async () => {
    const { clientProfileId } = await seedAdminAndClient();
    const packageType = await seedPaidPackageType();

    const response = await POST(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: "2026-08-10",
        isGift: true,
      }),
    );

    expect(response.status).toBe(201);

    const stored = await prisma.clientPackage.findFirstOrThrow({
      where: { clientProfileId },
    });
    // The gift keeps the REAL package type — that is what makes it valuable
    // for payroll — but hands over a single session.
    expect(stored.packageTypeId).toBe(packageType.id);
    expect(stored.isGift).toBe(true);
    expect(stored.sessionsGranted).toBe(1);
    expect(stored.sessionsRemaining).toBe(1);
  });

  it("honors an explicit gift session count", async () => {
    const { clientProfileId } = await seedAdminAndClient();
    const packageType = await seedPaidPackageType();

    const response = await POST(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: "2026-08-10",
        isGift: true,
        sessionsGranted: 3,
      }),
    );

    expect(response.status).toBe(201);
    const stored = await prisma.clientPackage.findFirstOrThrow({
      where: { clientProfileId },
    });
    expect(stored.sessionsGranted).toBe(3);
    expect(stored.sessionsRemaining).toBe(3);
  });

  it("rejects a gift session count above the package's own session count", async () => {
    const { clientProfileId } = await seedAdminAndClient();
    const packageType = await seedPaidPackageType();

    const response = await POST(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: "2026-08-10",
        isGift: true,
        sessionsGranted: 13,
      }),
    );

    expect(response.status).toBe(400);
  });

  it("leaves a normal paid assign untouched: full session count, not a gift", async () => {
    const { clientProfileId } = await seedAdminAndClient();
    const packageType = await seedPaidPackageType();

    const response = await POST(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: "2026-08-10",
      }),
    );

    expect(response.status).toBe(201);
    const stored = await prisma.clientPackage.findFirstOrThrow({
      where: { clientProfileId },
    });
    expect(stored.isGift).toBe(false);
    expect(stored.sessionsGranted).toBe(12);
    expect(stored.sessionsRemaining).toBe(12);
  });

  it("reports the gift's own total, so a 1-session gift never renders as 1/12", async () => {
    const { clientProfileId } = await seedAdminAndClient();
    const packageType = await seedPaidPackageType();

    const response = await POST(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: "2026-08-10",
        isGift: true,
      }),
    );

    const body = (await response.json()) as {
      clientPackage: { sessionsTotal?: number; sessionsRemaining: number };
    };
    // #133 fixed "13/12" by shipping one computed total; a gift breaks the
    // same computation in the other direction unless the granted count wins.
    expect(body.clientPackage.sessionsTotal).toBe(1);
    expect(body.clientPackage.sessionsRemaining).toBe(1);
  });
});

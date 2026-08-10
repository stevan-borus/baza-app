import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/packages/client-packages";
import { computePayrollMonth } from "@/lib/server/payroll";
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

  it("pays the trainer for a gift assigned through this route", async () => {
    // The whole point of gifting a REAL package: the session the client
    // attends on it is worth something to the trainer. This closes the loop
    // from the assign route all the way to the payout figure, rather than
    // building the gift row by hand as the payroll specs do.
    const { clientProfileId } = await seedAdminAndClient();
    const packageType = await seedPaidPackageType();

    const assigned = await POST(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: "2026-07-01",
        isGift: true,
      }),
    );
    expect(assigned.status).toBe(201);
    const { clientPackage } = (await assigned.json()) as {
      clientPackage: { id: string };
    };

    const trainer = await prisma.user.create({
      data: {
        email: "trainer@test.local",
        firstName: "Ana",
        lastName: "Trener",
        role: "TRAINER",
      },
    });
    await prisma.trainerRate.create({
      data: {
        trainerUserId: trainer.id,
        percent: 40,
        effectiveFrom: new Date("2026-01-01T05:00:00.000Z"),
      },
    });
    const classType = await prisma.classType.findFirstOrThrow();
    const startsAt = new Date("2026-07-15T08:00:00.000Z");
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
      },
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId,
        clientPackageId: clientPackage.id,
      },
    });

    const month = await computePayrollMonth(prisma, {
      trainerUserId: trainer.id,
      year: 2026,
      month: 7,
      asOf: new Date("2026-08-05T10:00:00.000Z"),
    });

    // A 1-session gift drawn from a 15.000 package: the grant IS the rate
    // basis, so the house pays the trainer the full single-session value —
    // never zero, which is what the old unpriced gift SKUs produced.
    expect(month.giftCount).toBe(1);
    expect(month.gross).toBe(15000);
    expect(month.payout).toBe(6000); // 40%
    expect(month.unpricedCount).toBe(0);
  });
});

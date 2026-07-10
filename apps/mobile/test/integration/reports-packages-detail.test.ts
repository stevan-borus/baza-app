import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_DETAIL } from "@/server/routes/reports/packages/detail";
import { prisma } from "@/lib/server/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
// env.setup.ts pins TEST_ANCHOR_TIME to 2026-05-09T10:00:00Z. Match it.
const ANCHOR_ISO = "2026-05-09T10:00:00Z";
const ANCHOR = new Date(ANCHOR_ISO);

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function asTrainer() {
  setMockUser({
    id: "trainer-1",
    role: "TRAINER",
    email: "trainer@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function req(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local${path}?${qs}`);
}

type DetailResponse = {
  success: boolean;
  headline: {
    activePackages: number;
    expiringSoon: number;
    consumptionRate: number;
    soldInPeriod: number;
  };
  mostSold: { packageTypeId: string; packageTypeName: string; count: number }[];
  compVsPaid: { paid: number; comp: number };
  recentActivations: {
    clientPackageId: string;
    clientUserId: string;
    clientFullName: string;
    packageTypeName: string;
    startsAt: string;
    isPaid: boolean;
  }[];
};

async function ensureFixtures() {
  const classType =
    (await prisma.classType.findFirst({ where: { name: "Reformer" } })) ??
    (await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    }));
  const reformer12 =
    (await prisma.packageType.findFirst({ where: { name: "Reformer 12" } })) ??
    (await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 365,
        lateCancelHours: 12,
        classTypeId: classType.id,
      },
    }));
  return { classType, reformer12 };
}

async function makeClient(tag: string) {
  const user = await prisma.user.create({
    data: {
      email: `client-${tag}@test.local`,
      firstName: "Client",
      lastName: tag,
      role: "CLIENT",
    },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id },
  });
  return { user, profile };
}

async function makePackage(opts: {
  clientProfileId: string;
  packageTypeId: string;
  classTypeId: string;
  startsAt: Date;
  expiresAt: Date;
  sessionsRemaining: number;
}) {
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: opts.packageTypeId,
      classTypeId: opts.classTypeId,
      lateCancelHours: 12,
      startsAt: opts.startsAt,
      expiresAt: opts.expiresAt,
      sessionsRemaining: opts.sessionsRemaining,
    },
  });
}

async function makePayment(opts: {
  clientUserId: string;
  packageTypeId: string;
  createdAt: Date;
  amount?: number;
}) {
  return prisma.billingRecord.create({
    data: {
      clientUserId: opts.clientUserId,
      amount: opts.amount ?? 12000,
      method: "CASH",
      status: "CONFIRMED",
      packageTypeId: opts.packageTypeId,
      createdAt: opts.createdAt,
    },
  });
}

describe("reports/packages/detail", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("aggregates headline tiles (active / expiring soon / consumption / sold)", async () => {
    const { classType, reformer12 } = await ensureFixtures();

    // 2 active packages expiring within 14d (ANCHOR + 7d).
    for (let i = 0; i < 2; i += 1) {
      const c = await makeClient(`expire-soon-${i}`);
      await makePackage({
        clientProfileId: c.profile.id,
        packageTypeId: reformer12.id,
        classTypeId: classType.id,
        startsAt: new Date(ANCHOR.getTime() - 30 * DAY_MS),
        expiresAt: new Date(ANCHOR.getTime() + 7 * DAY_MS),
        sessionsRemaining: 5,
      });
    }
    // 3 active packages expiring in 60d. Started well before the window so
    // they don't count as "soldInPeriod".
    for (let i = 0; i < 3; i += 1) {
      const c = await makeClient(`far-${i}`);
      await makePackage({
        clientProfileId: c.profile.id,
        packageTypeId: reformer12.id,
        classTypeId: classType.id,
        startsAt: new Date(ANCHOR.getTime() - 30 * DAY_MS),
        expiresAt: new Date(ANCHOR.getTime() + 60 * DAY_MS),
        sessionsRemaining: 12,
      });
    }
    // 4 packages started IN the report period [ANCHOR-7d, ANCHOR+3d).
    // Mix: 2 paid (BillingRecord linked to packageType), 2 comp (no
    // matching BillingRecord). Sessions remaining vary so consumption is
    // measurable.
    const periodPackages: { id: string; clientUserId: string; isPaid: boolean }[] = [];
    for (let i = 0; i < 4; i += 1) {
      const c = await makeClient(`sold-${i}`);
      const pkg = await makePackage({
        clientProfileId: c.profile.id,
        packageTypeId: reformer12.id,
        classTypeId: classType.id,
        startsAt: new Date(ANCHOR.getTime() - 2 * DAY_MS),
        // 12-3 = 9 consumed for "i<2", 12-12 = 0 for "i>=2", avg = (9+9+0+0)/12 = 0.375
        expiresAt: new Date(ANCHOR.getTime() + 30 * DAY_MS),
        sessionsRemaining: i < 2 ? 3 : 12,
      });
      const isPaid = i < 2;
      if (isPaid) {
        await makePayment({
          clientUserId: c.user.id,
          packageTypeId: reformer12.id,
          createdAt: new Date(ANCHOR.getTime() - 1 * DAY_MS),
        });
      }
      periodPackages.push({
        id: pkg.id,
        clientUserId: c.user.id,
        isPaid,
      });
    }

    asAdmin();
    const response = await GET_DETAIL(
      req("/api/reports/packages/detail", {
        from: new Date(ANCHOR.getTime() - 7 * DAY_MS).toISOString(),
        to: new Date(ANCHOR.getTime() + 3 * DAY_MS).toISOString(),
        period: "week",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DetailResponse;
    expect(body.success).toBe(true);

    // Active: 5 (2 expiring-soon + 3 far). Expiring soon: 2.
    // Plus the 4 period packages — those have expiresAt 30d out so they're
    // ALSO active (sessionsRemaining > 0) but NOT expiring-soon. Total
    // active = 5 + 4 = 9. Expiring-soon = 2.
    expect(body.headline.activePackages).toBe(9);
    expect(body.headline.expiringSoon).toBe(2);
    expect(body.headline.soldInPeriod).toBe(4);
    // Consumption rate: 9/12 + 9/12 + 0 + 0 averaged over 4 = 0.375
    expect(body.headline.consumptionRate).toBeCloseTo(0.375, 4);
  });

  it("sorts most-sold breakdown by count desc", async () => {
    const classType = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    const r12 = await prisma.packageType.create({
      data: {
        name: "R12",
        sessionCount: 12,
        validityDays: 365,
        lateCancelHours: 12,
        classTypeId: classType.id,
      },
    });
    const r8 = await prisma.packageType.create({
      data: {
        name: "R8",
        sessionCount: 8,
        validityDays: 365,
        lateCancelHours: 12,
        classTypeId: classType.id,
      },
    });
    const r4 = await prisma.packageType.create({
      data: {
        name: "R4",
        sessionCount: 4,
        validityDays: 365,
        lateCancelHours: 12,
        classTypeId: classType.id,
      },
    });
    // 1× R12, 3× R8, 2× R4 — expected sort: R8 (3), R4 (2), R12 (1).
    const sales: { packageTypeId: string; count: number }[] = [
      { packageTypeId: r12.id, count: 1 },
      { packageTypeId: r8.id, count: 3 },
      { packageTypeId: r4.id, count: 2 },
    ];
    for (const s of sales) {
      for (let i = 0; i < s.count; i += 1) {
        const c = await makeClient(`mostsold-${s.packageTypeId}-${i}`);
        await makePackage({
          clientProfileId: c.profile.id,
          packageTypeId: s.packageTypeId,
          classTypeId: classType.id,
          startsAt: new Date(ANCHOR.getTime() - 2 * DAY_MS),
          expiresAt: new Date(ANCHOR.getTime() + 90 * DAY_MS),
          sessionsRemaining: 4,
        });
      }
    }

    asAdmin();
    const response = await GET_DETAIL(
      req("/api/reports/packages/detail", {
        from: new Date(ANCHOR.getTime() - 7 * DAY_MS).toISOString(),
        to: new Date(ANCHOR.getTime() + 3 * DAY_MS).toISOString(),
        period: "week",
      }),
    );
    const body = (await response.json()) as DetailResponse;
    expect(body.mostSold.map((r) => r.packageTypeName)).toEqual([
      "R8",
      "R4",
      "R12",
    ]);
    expect(body.mostSold.map((r) => r.count)).toEqual([3, 2, 1]);
  });

  it("splits paid vs comp using the shared billing-package zipping helper", async () => {
    const { classType, reformer12 } = await ensureFixtures();

    // 2 paid (each has a confirmed BillingRecord) + 2 comp (none).
    for (let i = 0; i < 4; i += 1) {
      const c = await makeClient(`split-${i}`);
      await makePackage({
        clientProfileId: c.profile.id,
        packageTypeId: reformer12.id,
        classTypeId: classType.id,
        startsAt: new Date(ANCHOR.getTime() - 2 * DAY_MS),
        expiresAt: new Date(ANCHOR.getTime() + 90 * DAY_MS),
        sessionsRemaining: 12,
      });
      if (i < 2) {
        await makePayment({
          clientUserId: c.user.id,
          packageTypeId: reformer12.id,
          createdAt: new Date(ANCHOR.getTime() - 1 * DAY_MS),
        });
      }
    }

    asAdmin();
    const response = await GET_DETAIL(
      req("/api/reports/packages/detail", {
        from: new Date(ANCHOR.getTime() - 7 * DAY_MS).toISOString(),
        to: new Date(ANCHOR.getTime() + 3 * DAY_MS).toISOString(),
        period: "week",
      }),
    );
    const body = (await response.json()) as DetailResponse;
    expect(body.compVsPaid.paid).toBe(2);
    expect(body.compVsPaid.comp).toBe(2);
  });

  it("returns the most recent activations (up to 5) with isPaid flags", async () => {
    const { classType, reformer12 } = await ensureFixtures();
    // 6 activations — the page caps at 5.
    for (let i = 0; i < 6; i += 1) {
      const c = await makeClient(`recent-${i}`);
      await makePackage({
        clientProfileId: c.profile.id,
        packageTypeId: reformer12.id,
        classTypeId: classType.id,
        // Stagger startsAt so we know the ordering.
        startsAt: new Date(ANCHOR.getTime() - (6 - i) * 60 * 60 * 1000),
        expiresAt: new Date(ANCHOR.getTime() + 90 * DAY_MS),
        sessionsRemaining: 12,
      });
      // Last 3 are paid.
      if (i >= 3) {
        await makePayment({
          clientUserId: c.user.id,
          packageTypeId: reformer12.id,
          createdAt: new Date(ANCHOR.getTime() - (6 - i) * 60 * 60 * 1000 + 1),
        });
      }
    }

    asAdmin();
    const response = await GET_DETAIL(
      req("/api/reports/packages/detail", {
        from: new Date(ANCHOR.getTime() - 7 * DAY_MS).toISOString(),
        to: new Date(ANCHOR.getTime() + 3 * DAY_MS).toISOString(),
        period: "week",
      }),
    );
    const body = (await response.json()) as DetailResponse;
    expect(body.recentActivations).toHaveLength(5);
    // DESC by startsAt — the latest (i=5) is first. i=5 paid, i=4 paid,
    // i=3 paid, i=2 comp, i=1 comp.
    expect(body.recentActivations.map((r) => r.isPaid)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    // Each row has the client name + package type name.
    expect(body.recentActivations[0].clientFullName).toMatch(/Client recent-/);
    expect(body.recentActivations[0].packageTypeName).toBe("Reformer 12");
  });

  it("is forbidden for TRAINER callers", async () => {
    asTrainer();
    const response = await GET_DETAIL(
      req("/api/reports/packages/detail", {
        from: new Date(ANCHOR.getTime() - 7 * DAY_MS).toISOString(),
        to: new Date(ANCHOR.getTime() + 3 * DAY_MS).toISOString(),
        period: "week",
      }),
    );
    expect(response.status).toBe(403);
  });
});

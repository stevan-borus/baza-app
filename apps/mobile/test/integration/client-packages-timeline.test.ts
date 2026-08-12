import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/clients/me/packages";
import { prisma } from "@/lib/server/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeClassType() {
  return prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
}

async function makePackageType(classTypeId: string, name: string) {
  return prisma.packageType.create({
    data: { name, sessionCount: 10, validityDays: 60, classTypes: { create: { classTypeId } } },
  });
}

async function makeClient(email: string) {
  const user = await prisma.user.create({
    data: {
      email,
      firstName: "Test",
      lastName: "Client",
      role: "CLIENT",
      isActive: true,
    },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id },
  });
  return { user, profile };
}

async function makeClientPackage(opts: {
  clientProfileId: string;
  packageTypeId: string;
  classTypeId: string;
  createdAt?: Date;
}) {
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: opts.packageTypeId,
      classTypes: { create: { classTypeId: opts.classTypeId } },
      lateCancelHours: 8,
      startsAt: new Date(Date.now() - DAY_MS),
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
      sessionsRemaining: 8,
      sessionsGranted: 8,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

function asClient(opts: { id: string; clientProfileId: string }) {
  setMockUser({
    id: opts.id,
    role: "CLIENT",
    email: "client@test.local",
    isActive: true,
    clientProfile: { id: opts.clientProfileId },
  });
}

function buildRequest() {
  return new Request("http://test.local/api/clients/me/packages");
}

describe("GET /api/clients/me/packages", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("paid entry shows amount + method + package type name", async () => {
    const ct = await makeClassType();
    const pt = await makePackageType(ct.id, "10 termina");
    const { user, profile } = await makeClient("paid@test.local");
    const pkg = await makeClientPackage({
      clientProfileId: profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: user.id,
        amount: 12000,
        method: "CASH",
        status: "CONFIRMED",
        packageTypeId: pt.id,
        clientPackageId: pkg.id,
      },
    });

    asClient({ id: user.id, clientProfileId: profile.id });
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].kind).toBe("PAID");
    expect(body.entries[0].amount).toBe(12000);
    expect(body.entries[0].method).toBe("CASH");
    expect(body.entries[0].packageTypeName).toBe("10 termina");
  });

  it("comp entry (no BillingRecord) is kind COMP with null amount + method", async () => {
    const ct = await makeClassType();
    const pt = await makePackageType(ct.id, "Poklon paket");
    const { user, profile } = await makeClient("comp@test.local");
    await makeClientPackage({
      clientProfileId: profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
    });

    asClient({ id: user.id, clientProfileId: profile.id });
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].kind).toBe("COMP");
    expect(body.entries[0].amount).toBeNull();
    expect(body.entries[0].method).toBeNull();
    expect(body.entries[0].packageTypeName).toBe("Poklon paket");
  });

  it("PENDING-funded (pay-later) package is NOT a Poklon — kind PAID, paymentPending true, amount/method withheld", async () => {
    const ct = await makeClassType();
    const pt = await makePackageType(ct.id, "Pay-later 10");
    const { user, profile } = await makeClient("paylater@test.local");
    const pkg = await makeClientPackage({
      clientProfileId: profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
    });
    // The funding record exists but is still PENDING (assigned "Plaća
    // kasnije"). Filtering the timeline to CONFIRMED made this fall through to
    // COMP and render "Poklon" — a lie. It must now read PAID + pending.
    await prisma.billingRecord.create({
      data: {
        clientUserId: user.id,
        amount: 24000,
        method: "CASH",
        status: "PENDING",
        packageTypeId: pt.id,
        clientPackageId: pkg.id,
      },
    });

    asClient({ id: user.id, clientProfileId: profile.id });
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].kind).toBe("PAID");
    expect(body.entries[0].kind).not.toBe("COMP");
    expect(body.entries[0].paymentPending).toBe(true);
    // No confirmed amount/method yet — the UI shows "Nije plaćeno" instead.
    expect(body.entries[0].amount).toBeNull();
    expect(body.entries[0].method).toBeNull();
  });

  it("legacy un-backfilled row (no FK) is still classified PAID via the chronological-zip fallback — matching admin", async () => {
    const ct = await makeClassType();
    const pt = await makePackageType(ct.id, "Legacy 10");
    const { user, profile } = await makeClient("legacy@test.local");
    const pkg = await makeClientPackage({
      clientProfileId: profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
    });
    // The funding payment exists and is confirmed, but the FK was never
    // backfilled (clientPackageId left NULL) — the exact case the shared
    // linkPackagesToBilling fallback exists to catch. The bare-FK read would
    // mis-render this as a comp (gift); admin shows it as PAID, so must we.
    await prisma.billingRecord.create({
      data: {
        clientUserId: user.id,
        amount: 7500,
        method: "CARD",
        status: "CONFIRMED",
        packageTypeId: pt.id,
        clientPackageId: null,
      },
    });
    void pkg;

    asClient({ id: user.id, clientProfileId: profile.id });
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].kind).toBe("PAID");
    expect(body.entries[0].amount).toBe(7500);
    expect(body.entries[0].method).toBe("CARD");
  });

  it("COMPANY method is softened to PAID (raw chip never reaches the client)", async () => {
    const ct = await makeClassType();
    const pt = await makePackageType(ct.id, "Firma");
    const { user, profile } = await makeClient("company@test.local");
    const pkg = await makeClientPackage({
      clientProfileId: profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: user.id,
        amount: 9000,
        method: "COMPANY",
        status: "CONFIRMED",
        packageTypeId: pt.id,
        clientPackageId: pkg.id,
      },
    });

    asClient({ id: user.id, clientProfileId: profile.id });
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.entries[0].kind).toBe("PAID");
    expect(body.entries[0].method).toBe("PAID");
    expect(body.entries[0].method).not.toBe("COMPANY");
    expect(body.entries[0].amount).toBe(9000);
  });

  it("MANUAL_ONLINE method is mapped to ONLINE", async () => {
    const ct = await makeClassType();
    const pt = await makePackageType(ct.id, "Online");
    const { user, profile } = await makeClient("online@test.local");
    const pkg = await makeClientPackage({
      clientProfileId: profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: user.id,
        amount: 9000,
        method: "MANUAL_ONLINE",
        status: "CONFIRMED",
        packageTypeId: pt.id,
        clientPackageId: pkg.id,
      },
    });

    asClient({ id: user.id, clientProfileId: profile.id });
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.entries[0].method).toBe("ONLINE");
  });

  it("a client sees ONLY their own packages (isolation)", async () => {
    const ct = await makeClassType();
    const pt = await makePackageType(ct.id, "10 termina");
    const me = await makeClient("me@test.local");
    const stranger = await makeClient("stranger@test.local");
    await makeClientPackage({
      clientProfileId: me.profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
    });
    await makeClientPackage({
      clientProfileId: stranger.profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
    });

    asClient({ id: me.user.id, clientProfileId: me.profile.id });
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
  });

  it("orders newest-first by createdAt", async () => {
    const ct = await makeClassType();
    const pt = await makePackageType(ct.id, "10 termina");
    const { user, profile } = await makeClient("order@test.local");
    const older = await makeClientPackage({
      clientProfileId: profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
      createdAt: new Date(Date.now() - 10 * DAY_MS),
    });
    const newer = await makeClientPackage({
      clientProfileId: profile.id,
      packageTypeId: pt.id,
      classTypeId: ct.id,
      createdAt: new Date(Date.now() - 1 * DAY_MS),
    });

    asClient({ id: user.id, clientProfileId: profile.id });
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.entries.map((e: { id: string }) => e.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it("returns 403 for a non-client role", async () => {
    setMockUser({
      id: "admin-1",
      role: "ADMIN",
      email: "admin@test.local",
      isActive: true,
      clientProfile: null,
    });
    const res = await GET(buildRequest());
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    setMockUser(null);
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });
});

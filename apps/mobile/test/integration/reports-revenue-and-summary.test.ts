import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_REVENUE } from "@/server/routes/reports/revenue";
import { GET as GET_SUMMARY } from "@/server/routes/reports/summary";
import { nowMs } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
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
    clientProfile: { id: "p" },
  });
}

describe("reports/revenue", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("aggregates CONFIRMED payments per day bucket and excludes other statuses", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Test", role: "CLIENT" },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 1000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-07-15T09:00:00Z"),
      },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 2000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-07-15T17:00:00Z"),
      },
    });
    // PR β removed PENDING/CANCELED from BillingStatus, so the previously-
    // seeded "must NOT count" PENDING row is no longer constructible. The
    // API's status=CONFIRMED filter is still in place as defense in depth.

    asAdmin();
    const response = await GET_REVENUE(
      new Request(
        "http://test.local/api/reports/revenue?from=2026-07-01&to=2026-08-01&period=day",
      ),
    );
    const body = (await response.json()) as {
      data: { period: string; revenue: number; count: number }[];
    };
    expect(body.data).toEqual([
      { period: "2026-07-15", revenue: 3000, count: 2 },
    ]);
  });

  it("excludes payments outside the from-to window", async () => {
    const client = await prisma.user.create({
      data: { email: "c2@test.local", firstName: "C2", lastName: "Test", role: "CLIENT" },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 1000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-06-15T09:00:00Z"),
      },
    });

    asAdmin();
    const response = await GET_REVENUE(
      new Request(
        "http://test.local/api/reports/revenue?from=2026-07-01&to=2026-08-01&period=day",
      ),
    );
    const body = (await response.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("is forbidden for client callers", async () => {
    asClient();
    const response = await GET_REVENUE(
      new Request(
        "http://test.local/api/reports/revenue?from=2026-07-01&to=2026-08-01&period=day",
      ),
    );
    expect(response.status).toBe(403);
  });
});

describe("reports/summary", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns totals across clients, sessions, and CONFIRMED revenue", async () => {
    const trainer = await prisma.user.create({
      data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    });
    const reformer = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    const active = await prisma.user.create({
      data: { email: "a@test.local", firstName: "A", lastName: "Test", role: "CLIENT", isActive: true },
    });
    await prisma.clientProfile.create({ data: { userId: active.id } });
    const inactive = await prisma.user.create({
      data: {
        email: "i@test.local",
        firstName: "I",
        lastName: "Test",
        role: "CLIENT",
        isActive: false,
      },
    });
    await prisma.clientProfile.create({ data: { userId: inactive.id } });

    await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-07-15T10:00:00Z"),
        endsAt: new Date("2026-07-15T11:00:00Z"),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });

    await prisma.billingRecord.create({
      data: {
        clientUserId: active.id,
        amount: 5000,
        method: "CASH",
        status: "CONFIRMED",
      },
    });
    // PR β removed PENDING from BillingStatus; the historical "must NOT
    // count" guard row is no longer constructible.

    asAdmin();
    const response = await GET_SUMMARY(
      new Request("http://test.local/api/reports/summary"),
    );
    const body = (await response.json()) as {
      summary: {
        totalClients: number;
        activeClients: number;
        inactiveClients: number;
        totalSessions: number;
        revenue: number;
        totalPayments: number;
      };
    };
    expect(body.summary).toMatchObject({
      totalClients: 2,
      activeClients: 1,
      inactiveClients: 1,
      totalSessions: 1,
      revenue: 5000,
      totalPayments: 1,
    });
  });

  it("is forbidden for client callers", async () => {
    asClient();
    const response = await GET_SUMMARY(
      new Request("http://test.local/api/reports/summary"),
    );
    expect(response.status).toBe(403);
  });
});

/**
 * The admin dashboard's three client tiles.
 *
 * "Aktivni klijenti" read `user.count({ isActive: true })` — the soft-delete
 * flag — so it was the whole directory; "Novi klijenti ovog meseca" was that
 * same number restated; "Stopa dolazaka" divided clients by clients. These
 * cover what each one now means.
 */
describe("reports/summary — client tiles", () => {
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedFixture() {
    const trainer = await prisma.user.create({
      data: {
        email: "tiles-t@test.local",
        firstName: "T",
        lastName: "Tiles",
        role: "TRAINER",
      },
    });
    const classType = await prisma.classType.create({
      data: { name: "Tiles Reformer", maxClients: 6, durationMins: 60 },
    });
    const packageType = await prisma.packageType.create({
      data: {
        name: "Tiles 10",
        sessionCount: 10,
        price: 10000,
        validityDays: 60,
        classTypes: { create: { classTypeId: classType.id } },
      },
    });

    let seq = 0;
    async function client(createdAt: Date) {
      seq += 1;
      const user = await prisma.user.create({
        data: {
          email: `tiles-c${seq}@test.local`,
          firstName: `C${seq}`,
          lastName: "Tiles",
          role: "CLIENT",
        },
      });
      const profile = await prisma.clientProfile.create({
        data: { userId: user.id, createdAt },
      });
      return { user, profile };
    }

    async function pack(
      profileId: string,
      opts: {
        startsAt: Date;
        expiresAt: Date;
        sessionsRemaining?: number;
        revokedAt?: Date;
      },
    ) {
      return prisma.clientPackage.create({
        data: {
          clientProfileId: profileId,
          packageTypeId: packageType.id,
          classTypes: { create: { classTypeId: classType.id } },
          lateCancelHours: 12,
          startsAt: opts.startsAt,
          expiresAt: opts.expiresAt,
          sessionsRemaining: opts.sessionsRemaining ?? 6,
          sessionsGranted: 6,
          revokedAt: opts.revokedAt ?? null,
        },
      });
    }

    // env.setup.ts pins TEST_ANCHOR_TIME, and the route reads `now()` — so
    // the fixture has to hang off the same anchor, not wall clock.
    const instant = nowMs();
    const thisMonth = new Date(instant - DAY);
    const lastMonth = new Date(instant - 45 * DAY);

    // Counts as active NOW.
    const live = await client(thisMonth);
    await pack(live.profile.id, {
      startsAt: new Date(instant - 5 * DAY),
      expiresAt: new Date(instant + 30 * DAY),
    });

    // Expired pack — not active.
    const expired = await client(lastMonth);
    await pack(expired.profile.id, {
      startsAt: new Date(instant - 90 * DAY),
      expiresAt: new Date(instant - 2 * DAY),
    });

    // Revoked pack — not active.
    const revoked = await client(lastMonth);
    await pack(revoked.profile.id, {
      startsAt: new Date(instant - 5 * DAY),
      expiresAt: new Date(instant + 30 * DAY),
      revokedAt: new Date(instant - DAY),
    });

    // Used up — not active.
    const drained = await client(lastMonth);
    await pack(drained.profile.id, {
      startsAt: new Date(instant - 5 * DAY),
      expiresAt: new Date(instant + 30 * DAY),
      sessionsRemaining: 0,
    });

    // Not started yet — not active.
    const future = await client(lastMonth);
    await pack(future.profile.id, {
      startsAt: new Date(instant + 5 * DAY),
      expiresAt: new Date(instant + 40 * DAY),
    });

    // Live pack, but the client is inside a pause window — not active.
    const paused = await client(lastMonth);
    await pack(paused.profile.id, {
      startsAt: new Date(instant - 5 * DAY),
      expiresAt: new Date(instant + 30 * DAY),
    });
    await prisma.packagePause.create({
      data: {
        clientProfileId: paused.profile.id,
        startsAt: new Date(instant - 2 * DAY),
        endsAt: new Date(instant + 2 * DAY),
      },
    });

    // A session that already started: 2 kept + 1 cancelled reservation.
    const startedAt = new Date(instant - 3 * DAY);
    const past = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: startedAt,
        endsAt: new Date(startedAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: past.id, clientProfileId: live.profile.id },
    });
    await prisma.booking.create({
      data: { sessionId: past.id, clientProfileId: expired.profile.id },
    });
    await prisma.booking.create({
      data: {
        sessionId: past.id,
        clientProfileId: revoked.profile.id,
        canceledAt: new Date(instant - 4 * DAY),
      },
    });

    // A future session — its reservations must NOT count as attendance yet.
    const upcomingAt = new Date(instant + 3 * DAY);
    const upcoming = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: upcomingAt,
        endsAt: new Date(upcomingAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: upcoming.id, clientProfileId: drained.profile.id },
    });
    await prisma.booking.create({
      data: {
        sessionId: upcoming.id,
        clientProfileId: future.profile.id,
        canceledAt: new Date(instant - DAY),
      },
    });

    return { instant };
  }

  it("counts only clients whose package is usable right now", async () => {
    await seedFixture();
    asAdmin();

    const response = await GET_SUMMARY(
      new Request("http://test.local/api/reports/summary"),
    );
    const body = (await response.json()) as {
      summary: { clientsWithActivePackage: number; totalClients: number };
    };

    expect(body.summary.totalClients).toBe(6);
    // Expired, revoked, drained, not-yet-started and paused are all excluded.
    expect(body.summary.clientsWithActivePackage).toBe(1);
  });

  it("scopes newClients to the requested range and falls back to all-time", async () => {
    const { instant } = await seedFixture();
    asAdmin();

    const from = new Date(instant - 7 * DAY).toISOString();
    const to = new Date(instant + DAY).toISOString();
    const scoped = (await (
      await GET_SUMMARY(
        new Request(
          `http://test.local/api/reports/summary?from=${from}&to=${to}`,
        ),
      )
    ).json()) as { summary: { newClients: number } };
    expect(scoped.summary.newClients).toBe(1);

    const allTime = (await (
      await GET_SUMMARY(new Request("http://test.local/api/reports/summary"))
    ).json()) as { summary: { newClients: number; totalClients: number } };
    expect(allTime.summary.newClients).toBe(allTime.summary.totalClients);
    expect(allTime.summary.newClients).toBe(6);
  });

  it("rates attendance on started sessions only, and nulls an empty window", async () => {
    const { instant } = await seedFixture();
    asAdmin();

    const from = new Date(instant - 7 * DAY).toISOString();
    const to = new Date(instant + 7 * DAY).toISOString();
    const scoped = (await (
      await GET_SUMMARY(
        new Request(
          `http://test.local/api/reports/summary?from=${from}&to=${to}`,
        ),
      )
    ).json()) as { summary: { attendanceRate: number | null } };
    // 2 kept / 3 reservations on the one session that already started; the
    // future session's 1 kept + 1 cancelled are not attendance yet.
    expect(scoped.summary.attendanceRate).toBe(67);

    const futureFrom = new Date(instant + 2 * DAY).toISOString();
    const futureTo = new Date(instant + 10 * DAY).toISOString();
    const empty = (await (
      await GET_SUMMARY(
        new Request(
          `http://test.local/api/reports/summary?from=${futureFrom}&to=${futureTo}`,
        ),
      )
    ).json()) as { summary: { attendanceRate: number | null } };
    expect(empty.summary.attendanceRate).toBeNull();

    const allTime = (await (
      await GET_SUMMARY(new Request("http://test.local/api/reports/summary"))
    ).json()) as { summary: { attendanceRate: number | null } };
    expect(allTime.summary.attendanceRate).toBe(67);
  });
});

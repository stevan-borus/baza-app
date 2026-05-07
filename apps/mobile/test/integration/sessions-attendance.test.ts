/**
 * Integration tests for the trainer schedule's post-cron attendance markers.
 *
 * The SessionConsumption cron runs after a session ends and creates one
 * `SessionConsumption` row per active (non-canceled) booking that found an
 * eligible package. From the trainer's perspective:
 *   - Row exists → "consumed" / attended
 *   - Booking canceled  → "canceled" (regardless of cutoff)
 *   - Booking active, no row → "no-show" (e.g. no eligible package)
 *
 * The trainer schedule renders monthly availability, so we extend
 * `GET /api/sessions/availability` to include an `attendance` block on past
 * sessions (`endsAt < now`) and return `null` for future ones.
 *
 * Auth-mock + setup-db plumbing mirrors `clients.test.ts` /
 * `availability-class-filter.test.ts`.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

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

import { GET } from "@/app/api/sessions/availability/+api";
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";

async function seed() {
  const trainer = await prisma.user.create({
    data: { email: "tr@test.local", fullName: "T", role: "TRAINER" },
  });
  const otherTrainer = await prisma.user.create({
    data: { email: "tr2@test.local", fullName: "T2", role: "TRAINER" },
  });
  const c1User = await prisma.user.create({
    data: { email: "c1@test.local", fullName: "C1", role: "CLIENT" },
  });
  const c2User = await prisma.user.create({
    data: { email: "c2@test.local", fullName: "C2", role: "CLIENT" },
  });
  const c3User = await prisma.user.create({
    data: { email: "c3@test.local", fullName: "C3", role: "CLIENT" },
  });
  const c1 = await prisma.clientProfile.create({ data: { userId: c1User.id } });
  const c2 = await prisma.clientProfile.create({ data: { userId: c2User.id } });
  const c3 = await prisma.clientProfile.create({ data: { userId: c3User.id } });
  const classType = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  return { trainer, otherTrainer, c1, c2, c3, classType };
}

function buildRequest(month: string) {
  return new Request(
    `http://test.local/api/sessions/availability?month=${encodeURIComponent(month)}`,
  );
}

// Derive PAST / FUTURE / MONTH from the anchor so the spec stays
// deterministic regardless of which anchor instant is configured. We want
// MONTH to contain BOTH a past day and a future day relative to "now",
// so we use the start-of-anchor-month as a base and pick the 1st (past)
// and last day (future) of that month.
const ANCHOR_NOW = now();
const ANCHOR_YEAR = ANCHOR_NOW.getUTCFullYear();
const ANCHOR_MONTH_IDX = ANCHOR_NOW.getUTCMonth();
const MONTH = `${ANCHOR_YEAR}-${String(ANCHOR_MONTH_IDX + 1).padStart(2, "0")}`;
const PAST = new Date(Date.UTC(ANCHOR_YEAR, ANCHOR_MONTH_IDX, 1, 0, 0, 0));
// Last day of anchor month at 23:00 — guaranteed future when the anchor
// isn't on the last day; if anchor is on the last day, this still works
// as long as the hour is after `anchor.getUTCHours()`. With our chosen
// anchor (`2026-05-09T10:00:00Z`), end-of-month at 23:00 is comfortably
// in the future.
const FUTURE = new Date(
  Date.UTC(ANCHOR_YEAR, ANCHOR_MONTH_IDX + 1, 0, 23, 0, 0),
);

describe("GET /api/sessions/availability — attendance markers", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("past session returns attendance counts (consumed, canceled, totalBookings)", async () => {
    const { trainer, c1, c2, c3, classType } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: PAST,
        endsAt: new Date(PAST.getTime() + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    // c1 + c2 booked + consumed (cron created rows). c3 booked then canceled.
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: c1.id },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: c2.id },
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: c3.id,
        canceledAt: new Date(PAST.getTime() - 30 * 60 * 1000),
      },
    });
    await prisma.sessionConsumption.create({
      data: { sessionId: session.id, clientProfileId: c1.id },
    });
    await prisma.sessionConsumption.create({
      data: { sessionId: session.id, clientProfileId: c2.id },
    });

    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(MONTH));
    expect(res.status).toBe(200);
    const json = await res.json();
    const found = json.sessions.find((s: { id: string }) => s.id === session.id);
    expect(found).toBeTruthy();
    expect(found.attendance).toEqual({
      consumedCount: 2,
      canceledCount: 1,
      totalBookings: 3,
    });
  });

  it("future session returns attendance: null", async () => {
    const { trainer, c1, classType } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: FUTURE,
        endsAt: new Date(FUTURE.getTime() + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: c1.id },
    });

    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const found = json.sessions.find((s: { id: string }) => s.id === session.id);
    expect(found).toBeTruthy();
    expect(found.attendance).toBeNull();
  });

  it("trainer scoping is preserved — other trainer's past session is hidden", async () => {
    const { trainer, otherTrainer, c1, classType } = await seed();
    const ownSession = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: PAST,
        endsAt: new Date(PAST.getTime() + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    const otherSession = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: otherTrainer.id,
        startsAt: PAST,
        endsAt: new Date(PAST.getTime() + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: otherSession.id, clientProfileId: c1.id },
    });

    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const ids = json.sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain(ownSession.id);
    expect(ids).not.toContain(otherSession.id);
  });

  it("past session with only canceled bookings reports consumedCount=0", async () => {
    const { trainer, c1, classType } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: PAST,
        endsAt: new Date(PAST.getTime() + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: c1.id,
        canceledAt: new Date(PAST.getTime() - 60 * 60 * 1000),
      },
    });

    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const found = json.sessions.find((s: { id: string }) => s.id === session.id);
    expect(found.attendance).toEqual({
      consumedCount: 0,
      canceledCount: 1,
      totalBookings: 1,
    });
  });
});

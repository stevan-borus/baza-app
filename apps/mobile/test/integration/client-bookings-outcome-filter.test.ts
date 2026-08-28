/**
 * GET /api/clients/[id]/bookings?outcome=… — the Održani / Otkazani split.
 *
 * The studio asked for two tabs on "Prošli treninzi" and, crucially, for the
 * cancelled tab to hide cancellations that cost the client nothing: an early
 * cancel is noise, a forfeited one is a session they paid for and didn't use.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/clients/[id]/bookings";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

async function makeClient(email: string) {
  const user = await prisma.user.create({
    data: { email, firstName: "Test", lastName: "Client", role: "CLIENT", isActive: true },
  });
  const profile = await prisma.clientProfile.create({ data: { userId: user.id } });
  return { user, profile };
}

async function makeSession(classTypeId: string, trainerUserId: string, startsAt: Date) {
  return prisma.session.create({
    data: {
      classTypeId,
      trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function asClient(id: string, clientProfileId: string) {
  setMockUser({
    id,
    role: "CLIENT",
    email: "client@test.local",
    isActive: true,
    clientProfile: { id: clientProfileId },
  });
}

function req(clientUserId: string, qs: string) {
  return new Request(`http://test.local/api/clients/${clientUserId}/bookings?${qs}`);
}

describe("GET /api/clients/[id]/bookings — outcome filter", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function scenario(email: string) {
    const classType = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    const trainer = await prisma.user.create({
      data: { email: `t-${email}`, firstName: "T", lastName: "R", role: "TRAINER" },
    });
    const packageType = await prisma.packageType.create({
      data: { name: "Reformer 12", sessionCount: 12, validityDays: 30, price: 12000, lateCancelHours: 8 },
    });
    const { user, profile } = await makeClient(email);
    const clientPackage = await prisma.clientPackage.create({
      data: {
        clientProfileId: profile.id,
        packageTypeId: packageType.id,
        startsAt: new Date(nowMs() - 10 * DAY_MS),
        expiresAt: new Date(nowMs() + 20 * DAY_MS),
        sessionsRemaining: 8,
        sessionsGranted: 12,
        lateCancelHours: 8,
      },
    });
    return { classType, trainer, user, profile, clientPackage };
  }

  it("Održani returns only past uncancelled bookings", async () => {
    const s = await scenario("held@test.local");
    const attended = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 3 * DAY_MS));
    await prisma.booking.create({
      data: { sessionId: attended.id, clientProfileId: s.profile.id, clientPackageId: s.clientPackage.id },
    });
    const canceled = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 2 * DAY_MS));
    await prisma.booking.create({
      data: {
        sessionId: canceled.id,
        clientProfileId: s.profile.id,
        clientPackageId: s.clientPackage.id,
        canceledAt: new Date(nowMs() - 2 * DAY_MS - HOUR_MS),
      },
    });

    asAdmin();
    const res = await GET(req(s.user.id, "period=past&outcome=attended"), { id: s.user.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].session.id).toBe(attended.id);
    expect(body.bookings[0].status).toBe("CONFIRMED");
  });

  it("Otkazani INCLUDES a late cancel that consumed a session", async () => {
    const s = await scenario("late@test.local");
    const session = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 2 * DAY_MS));
    // Cancelled 1h before start — inside the 8h window.
    const canceledAt = new Date(session.startsAt.getTime() - HOUR_MS);
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: s.profile.id,
        clientPackageId: s.clientPackage.id,
        canceledAt,
      },
    });
    await prisma.sessionConsumption.create({
      data: {
        clientProfileId: s.profile.id,
        sessionId: session.id,
        clientName: "Test Client",
        packageName: "Reformer 12",
        sessionValue: 1000,
      },
    });

    asAdmin();
    const res = await GET(req(s.user.id, "period=past&outcome=canceled"), { id: s.user.id });
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].session.id).toBe(session.id);
    expect(body.bookings[0].status).toBe("CANCELED");
    expect(body.bookings[0].canceledAt).toBe(canceledAt.toISOString());
    expect(body.bookings[0].consumedSession).toBe(true);
  });

  it("Otkazani EXCLUDES an early cancel — it cost the client nothing", async () => {
    const s = await scenario("early@test.local");
    const session = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 2 * DAY_MS));
    // Cancelled 3 days before start — well outside the 8h window, so no
    // SessionConsumption row was ever written.
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: s.profile.id,
        clientPackageId: s.clientPackage.id,
        canceledAt: new Date(session.startsAt.getTime() - 3 * DAY_MS),
      },
    });

    asAdmin();
    const res = await GET(req(s.user.id, "period=past&outcome=canceled"), { id: s.user.id });
    const body = await res.json();
    expect(body.bookings).toHaveLength(0);
  });

  it("Otkazani EXCLUDES a waived late cancel — the admin forgave the charge", async () => {
    const s = await scenario("waived@test.local");
    const admin = await prisma.user.create({
      data: { email: "waiver-admin@test.local", firstName: "A", lastName: "D", role: "ADMIN" },
    });
    const session = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 2 * DAY_MS));
    // Late by the clock, but waived: no SessionConsumption row exists.
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: s.profile.id,
        clientPackageId: s.clientPackage.id,
        canceledAt: new Date(session.startsAt.getTime() - HOUR_MS),
        waivedByUserId: admin.id,
      },
    });

    asAdmin();
    const res = await GET(req(s.user.id, "period=past&outcome=canceled"), { id: s.user.id });
    const body = await res.json();
    expect(body.bookings).toHaveLength(0);
  });

  it("Otkazani keeps a late cancel whose package row was later deleted", async () => {
    // Booking.clientPackageId is onDelete: SetNull. If the classification were
    // recomputed from lateCancelHours it would fall back to 0 here and call a
    // real forfeit "early". The SessionConsumption row is the fact.
    const s = await scenario("orphan@test.local");
    const session = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 2 * DAY_MS));
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: s.profile.id,
        clientPackageId: s.clientPackage.id,
        canceledAt: new Date(session.startsAt.getTime() - HOUR_MS),
      },
    });
    await prisma.sessionConsumption.create({
      data: {
        clientProfileId: s.profile.id,
        sessionId: session.id,
        clientName: "Test Client",
        packageName: "Reformer 12",
      },
    });
    await prisma.clientPackage.delete({ where: { id: s.clientPackage.id } });

    asAdmin();
    const res = await GET(req(s.user.id, "period=past&outcome=canceled"), { id: s.user.id });
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].consumedSession).toBe(true);
  });

  it("Otkazani includes a cancelled FUTURE session that already forfeited", async () => {
    const s = await scenario("future@test.local");
    const session = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() + 3 * HOUR_MS));
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: s.profile.id,
        clientPackageId: s.clientPackage.id,
        canceledAt: new Date(nowMs() - 30 * 60 * 1000),
      },
    });
    await prisma.sessionConsumption.create({
      data: {
        clientProfileId: s.profile.id,
        sessionId: session.id,
        clientName: "Test Client",
        packageName: "Reformer 12",
      },
    });

    asAdmin();
    const res = await GET(req(s.user.id, "period=past&outcome=canceled"), { id: s.user.id });
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].session.id).toBe(session.id);
  });

  it("a no-show consumption does NOT drag an uncancelled booking into Otkazani", async () => {
    // cron:sessions writes a SessionConsumption for a no-show too. The
    // cancelled filter must still key off canceledAt, not the row alone.
    const s = await scenario("noshow@test.local");
    const session = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 2 * DAY_MS));
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: s.profile.id, clientPackageId: s.clientPackage.id },
    });
    await prisma.sessionConsumption.create({
      data: {
        clientProfileId: s.profile.id,
        sessionId: session.id,
        clientName: "Test Client",
        packageName: "Reformer 12",
      },
    });

    asAdmin();
    const canceledRes = await GET(req(s.user.id, "period=past&outcome=canceled"), { id: s.user.id });
    expect((await canceledRes.json()).bookings).toHaveLength(0);
    const attendedRes = await GET(req(s.user.id, "period=past&outcome=attended"), { id: s.user.id });
    expect((await attendedRes.json()).bookings).toHaveLength(1);
  });

  it("omitting outcome keeps the old unfiltered past behaviour", async () => {
    const s = await scenario("legacy@test.local");
    const attended = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 3 * DAY_MS));
    await prisma.booking.create({
      data: { sessionId: attended.id, clientProfileId: s.profile.id, clientPackageId: s.clientPackage.id },
    });
    const early = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 2 * DAY_MS));
    await prisma.booking.create({
      data: {
        sessionId: early.id,
        clientProfileId: s.profile.id,
        clientPackageId: s.clientPackage.id,
        canceledAt: new Date(early.startsAt.getTime() - 3 * DAY_MS),
      },
    });

    asAdmin();
    const res = await GET(req(s.user.id, "period=past"), { id: s.user.id });
    const body = await res.json();
    expect(body.bookings).toHaveLength(2);
  });

  it("rejects an unknown outcome value", async () => {
    const s = await scenario("badoutcome@test.local");
    asAdmin();
    const res = await GET(req(s.user.id, "period=past&outcome=bogus"), { id: s.user.id });
    expect(res.status).toBe(400);
  });

  it("rejects outcome on the upcoming period", async () => {
    const s = await scenario("upcomingoutcome@test.local");
    asAdmin();
    const res = await GET(req(s.user.id, "period=upcoming&outcome=canceled"), { id: s.user.id });
    expect(res.status).toBe(400);
  });

  it("paginates the filtered set so page sizes stay honest", async () => {
    const s = await scenario("paging@test.local");
    for (let i = 1; i <= 3; i++) {
      const session = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - i * DAY_MS));
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: s.profile.id,
          clientPackageId: s.clientPackage.id,
          canceledAt: new Date(session.startsAt.getTime() - HOUR_MS),
        },
      });
      await prisma.sessionConsumption.create({
        data: {
          clientProfileId: s.profile.id,
          sessionId: session.id,
          clientName: "Test Client",
          packageName: "Reformer 12",
        },
      });
      // An early cancel between each — must never eat a page slot.
      const free = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - i * DAY_MS - HOUR_MS));
      await prisma.booking.create({
        data: {
          sessionId: free.id,
          clientProfileId: s.profile.id,
          clientPackageId: s.clientPackage.id,
          canceledAt: new Date(free.startsAt.getTime() - 5 * DAY_MS),
        },
      });
    }

    asAdmin();
    const page1Res = await GET(req(s.user.id, "period=past&outcome=canceled&limit=2"), { id: s.user.id });
    const page1 = await page1Res.json();
    expect(page1.bookings).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2Res = await GET(
      req(s.user.id, `period=past&outcome=canceled&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`),
      { id: s.user.id },
    );
    const page2 = await page2Res.json();
    expect(page2.bookings).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("a client can read their own filtered history", async () => {
    const s = await scenario("self@test.local");
    const session = await makeSession(s.classType.id, s.trainer.id, new Date(nowMs() - 2 * DAY_MS));
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: s.profile.id, clientPackageId: s.clientPackage.id },
    });

    asClient(s.user.id, s.profile.id);
    const res = await GET(req(s.user.id, "period=past&outcome=attended"), { id: s.user.id });
    expect(res.status).toBe(200);
    expect((await res.json()).bookings).toHaveLength(1);
  });
});

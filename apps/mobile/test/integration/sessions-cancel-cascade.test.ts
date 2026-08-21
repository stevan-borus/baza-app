import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";
import { setMockUser } from "./auth-mock";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { nowMs } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";
import { GET as clientBookingsGET } from "@/server/routes/clients/[id]/bookings";
import { DELETE as sessionDELETE, PATCH as sessionPATCH } from "@/server/routes/sessions/[id]";

// Session-level cancel (PATCH /api/sessions/:id with status=CANCELED) must
// cascade to the bookings it kills. Before this cascade existed the session
// flipped to CANCELED while its bookings stayed live: the client saw a ghost
// "CONFIRMED" reservation they could not clear (the self-cancel route rejects
// a non-SCHEDULED session) and the admin could never delete the session
// (DELETE 409s on active bookings).
//
// The studio called the class off, so the cancel is always free: no forfeit,
// no consumption row, no package decrement — even inside the late-cancel
// window. And there is nothing to promote into, so waitlist entries are
// dropped rather than promoted (they otherwise keep holding capacity via
// countHeldSessions).

async function seedStudio() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "U", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Tre", lastName: "Ner", role: "TRAINER" },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
  return { admin, trainer, classType };
}

async function seedClient(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `klijent-${suffix}@test.local`,
      firstName: "Mara",
      lastName: suffix.toUpperCase(),
      role: "CLIENT",
    },
  });
  const clientProfile = await prisma.clientProfile.create({ data: { userId: user.id } });
  return { user, clientProfile };
}

async function seedPackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  lateCancelHours: number;
}) {
  const packageType = await prisma.packageType.create({
    data: {
      name: `Reformer 12 ${opts.clientProfileId.slice(0, 8)}`,
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: opts.lateCancelHours,
      price: 12000,
      classTypes: { create: { classTypeId: opts.classTypeId } },
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypes: { create: { classTypeId: opts.classTypeId } },
      lateCancelHours: opts.lateCancelHours,
      startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
      expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
      sessionsRemaining: 12,
      sessionsGranted: 12,
    },
  });
}

async function makeSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsInMs: number;
  capacity?: number;
}) {
  const startsAt = new Date(nowMs() + opts.startsInMs);
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      capacity: opts.capacity ?? 6,
    },
  });
}

function patchSession(id: string, body: Record<string, unknown>) {
  return sessionPATCH(
    new Request(`http://test.local/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { id },
  );
}

function listClientBookings(userId: string, period: "upcoming" | "past") {
  return clientBookingsGET(
    new Request(`http://test.local/api/clients/${userId}/bookings?period=${period}`),
    { id: userId },
  );
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("session cancel cascades to bookings", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cancels the session's live bookings", async () => {
    const { admin, trainer, classType } = await seedStudio();
    const { clientProfile } = await seedClient("a");
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsInMs: 9 * DAY,
    });
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });

    const res = await patchSession(session.id, { status: "CANCELED" });
    expect(res.status).toBe(200);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.canceledAt).not.toBeNull();
  });

  it("never charges the client, even inside the late-cancel window", async () => {
    const { admin, trainer, classType } = await seedStudio();
    const { clientProfile } = await seedClient("late");
    const clientPackage = await seedPackage({
      clientProfileId: clientProfile.id,
      classTypeId: classType.id,
      lateCancelHours: 8,
    });
    // Starts in 1h with an 8h late-cancel window — a client-initiated cancel
    // here would forfeit a session. A studio-initiated one must not.
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsInMs: HOUR,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: clientPackage.id,
        createdByUserId: admin.id,
      },
    });

    const res = await patchSession(session.id, { status: "CANCELED" });
    expect(res.status).toBe(200);

    const consumptions = await prisma.sessionConsumption.count({
      where: { sessionId: session.id },
    });
    expect(consumptions).toBe(0);
    const pkgAfter = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: clientPackage.id },
    });
    expect(pkgAfter.sessionsRemaining).toBe(12);
  });

  it("drops waitlist entries without promoting anyone", async () => {
    const { admin, trainer, classType } = await seedStudio();
    const booked = await seedClient("booked");
    const waiting = await seedClient("waiting");
    await seedPackage({
      clientProfileId: waiting.clientProfile.id,
      classTypeId: classType.id,
      lateCancelHours: 8,
    });
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsInMs: 7 * DAY,
      capacity: 1,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: booked.clientProfile.id,
        createdByUserId: admin.id,
      },
    });
    await prisma.waitlistEntry.create({
      data: {
        sessionId: session.id,
        clientProfileId: waiting.clientProfile.id,
        position: 1,
      },
    });

    const res = await patchSession(session.id, { status: "CANCELED" });
    expect(res.status).toBe(200);

    const waitlistAfter = await prisma.waitlistEntry.count({
      where: { sessionId: session.id },
    });
    expect(waitlistAfter).toBe(0);
    // The waitlisted client must NOT end up holding a booking on a dead class.
    const promoted = await prisma.booking.count({
      where: { sessionId: session.id, clientProfileId: waiting.clientProfile.id },
    });
    expect(promoted).toBe(0);
  });

  it("moves the booking out of the client's upcoming list and into past as CANCELED", async () => {
    const { admin, trainer, classType } = await seedStudio();
    const { user, clientProfile } = await seedClient("lists");
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsInMs: 9 * DAY,
    });
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });

    await patchSession(session.id, { status: "CANCELED" });

    const upcoming = await (await listClientBookings(user.id, "upcoming")).json();
    expect(upcoming.bookings.map((b: { id: string }) => b.id)).not.toContain(booking.id);

    const past = await (await listClientBookings(user.id, "past")).json();
    const row = past.bookings.find((b: { id: string }) => b.id === booking.id);
    expect(row).toBeDefined();
    expect(row.status).toBe("CANCELED");
  });

  it("lets the admin delete the session afterwards", async () => {
    const { admin, trainer, classType } = await seedStudio();
    const { clientProfile } = await seedClient("delete");
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsInMs: 9 * DAY,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });

    await patchSession(session.id, { status: "CANCELED" });

    const res = await sessionDELETE(
      new Request(`http://test.local/api/sessions/${session.id}`, { method: "DELETE" }),
      { id: session.id },
    );
    expect(res.status).toBe(200);
    const stillThere = await prisma.session.findUnique({ where: { id: session.id } });
    expect(stillThere).toBeNull();
  });

  it("leaves bookings alone for an edit that does not cancel", async () => {
    const { admin, trainer, classType } = await seedStudio();
    const { clientProfile } = await seedClient("edit");
    const room = await prisma.studioRoom.create({ data: { name: "Studio A", capacity: 8 } });
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsInMs: 9 * DAY,
    });
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });
    await prisma.waitlistEntry.create({
      data: {
        sessionId: session.id,
        clientProfileId: (await seedClient("edit-wait")).clientProfile.id,
        position: 1,
      },
    });

    const res = await patchSession(session.id, { roomId: room.id, capacity: 4 });
    expect(res.status).toBe(200);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.canceledAt).toBeNull();
    const waitlistAfter = await prisma.waitlistEntry.count({
      where: { sessionId: session.id },
    });
    expect(waitlistAfter).toBe(1);
  });

  it("is idempotent — re-cancelling keeps the original cancellation stamp", async () => {
    const { admin, trainer, classType } = await seedStudio();
    const { clientProfile } = await seedClient("idem");
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsInMs: 9 * DAY,
    });
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });

    await patchSession(session.id, { status: "CANCELED" });
    const firstPass = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(firstPass.canceledAt).not.toBeNull();

    // Manually re-open the booking to prove the second PATCH does NOT re-run
    // the cascade: the session was already CANCELED, so `becameCanceled` is
    // false and nothing should be rewritten.
    await prisma.booking.update({ where: { id: booking.id }, data: { canceledAt: null } });

    const res = await patchSession(session.id, { status: "CANCELED" });
    expect(res.status).toBe(200);
    const secondPass = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(secondPass.canceledAt).toBeNull();
    const consumptions = await prisma.sessionConsumption.count({
      where: { sessionId: session.id },
    });
    expect(consumptions).toBe(0);
  });
});

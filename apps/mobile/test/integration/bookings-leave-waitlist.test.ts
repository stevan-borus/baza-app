import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/bookings";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

async function seed() {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "User", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return { trainer, client, clientProfile, reformer };
}

async function createSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAt: Date;
  capacity?: number;
}) {
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      startsAt: opts.startsAt,
      endsAt: new Date(opts.startsAt.getTime() + 60 * 60 * 1000),
      capacity: opts.capacity ?? 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function createPackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  sessionsRemaining: number;
}) {
  const packageType = await prisma.packageType.create({
    data: {
      name: `pt-${Math.random()}`,
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: opts.classTypeId } },
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypes: { create: { classTypeId: opts.classTypeId } },
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
      expiresAt: new Date(nowMs() + 60 * 24 * 60 * 60 * 1000),
      sessionsRemaining: opts.sessionsRemaining,
    },
  });
}

function req(sessionId: string, action: "BOOK" | "CANCEL" | "LEAVE_WAITLIST") {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, action }),
  });
}

function asClient(client: { id: string; email: string }, profileId: string) {
  setMockUser({
    id: client.id,
    role: "CLIENT",
    email: client.email,
    isActive: true,
    clientProfile: { id: profileId },
  });
}

const DAY = 24 * 60 * 60 * 1000;

/** Puts `clientProfile` on the waitlist of a full (capacity-1) future session
 *  and returns that session. Another client occupies the single seat. */
async function joinWaitlist(opts: {
  clientProfileId: string;
  classTypeId: string;
  trainerUserId: string;
}) {
  const full = await createSession({
    classTypeId: opts.classTypeId,
    trainerUserId: opts.trainerUserId,
    startsAt: new Date(nowMs() + 1 * DAY),
    capacity: 1,
  });
  const otherUser = await prisma.user.create({
    data: { email: `o-${Math.random()}@test.local`, firstName: "O", lastName: "P", role: "CLIENT" },
  });
  const other = await prisma.clientProfile.create({
    data: { userId: otherUser.id, dateOfBirth: new Date("1990-01-01") },
  });
  await prisma.booking.create({ data: { sessionId: full.id, clientProfileId: other.id } });
  return full;
}

describe("POST /api/bookings LEAVE_WAITLIST", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("removes the caller's waitlist entry and releases the held session", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id, sessionsRemaining: 1 });
    asClient(client, clientProfile.id);

    const full = await joinWaitlist({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
    });

    // Join the waitlist — reserves the lone session.
    const wl = await POST(req(full.id, "BOOK"));
    expect((await wl.json()).state).toBe("WAITLISTED");

    // The hold is real: a normal open session is now rejected.
    const open = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * DAY) });
    expect((await POST(req(open.id, "BOOK"))).status).toBe(409);

    // Leave the waitlist.
    const left = await POST(req(full.id, "LEAVE_WAITLIST"));
    expect(left.status).toBe(200);
    expect((await left.json()).state).toBe("LEFT_WAITLIST");

    // Entry is gone.
    const entries = await prisma.waitlistEntry.count({
      where: { sessionId: full.id, clientProfileId: clientProfile.id },
    });
    expect(entries).toBe(0);

    // Hold released: the same open session now books.
    const rebook = await POST(req(open.id, "BOOK"));
    expect(rebook.status).toBe(200);
    expect((await rebook.json()).state).toBe("BOOKED");
  });

  it("is idempotent — leaving twice succeeds with no error", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id, sessionsRemaining: 1 });
    asClient(client, clientProfile.id);

    const full = await joinWaitlist({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
    });
    await POST(req(full.id, "BOOK"));

    const first = await POST(req(full.id, "LEAVE_WAITLIST"));
    expect(first.status).toBe(200);
    const second = await POST(req(full.id, "LEAVE_WAITLIST"));
    expect(second.status).toBe(200);
    expect((await second.json()).state).toBe("LEFT_WAITLIST");
  });

  it("lets the client leave a waitlist even after the session is canceled", async () => {
    // A canceled session leaves the waitlist row (and its held slot) behind and
    // never surfaces in availability, so LEAVE_WAITLIST is the only way out — it
    // must not be blocked by the SCHEDULED-only session guard.
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id, sessionsRemaining: 1 });
    asClient(client, clientProfile.id);

    const full = await joinWaitlist({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
    });
    await POST(req(full.id, "BOOK"));

    // The class gets canceled.
    await prisma.session.update({ where: { id: full.id }, data: { status: "CANCELED" } });

    const left = await POST(req(full.id, "LEAVE_WAITLIST"));
    expect(left.status).toBe(200);
    expect((await left.json()).state).toBe("LEFT_WAITLIST");

    const entries = await prisma.waitlistEntry.count({
      where: { sessionId: full.id, clientProfileId: clientProfile.id },
    });
    expect(entries).toBe(0);
  });

  it("promotes nobody and forfeits no session when leaving", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id, sessionsRemaining: 1 });
    asClient(client, clientProfile.id);

    const full = await joinWaitlist({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
    });
    // A second client waits behind us.
    const behindUser = await prisma.user.create({
      data: { email: "behind@test.local", firstName: "B", lastName: "H", role: "CLIENT" },
    });
    const behind = await prisma.clientProfile.create({
      data: { userId: behindUser.id, dateOfBirth: new Date("1990-01-01") },
    });
    await prisma.waitlistEntry.create({ data: { sessionId: full.id, clientProfileId: behind.id, position: 1 } });

    await POST(req(full.id, "BOOK")); // we join at position 2

    await POST(req(full.id, "LEAVE_WAITLIST"));

    // The client behind us is NOT promoted into a booking — leaving frees no seat.
    const behindBooking = await prisma.booking.count({
      where: { sessionId: full.id, clientProfileId: behind.id, canceledAt: null },
    });
    expect(behindBooking).toBe(0);
    // They remain on the waitlist.
    const behindStillWaiting = await prisma.waitlistEntry.count({
      where: { sessionId: full.id, clientProfileId: behind.id },
    });
    expect(behindStillWaiting).toBe(1);

    // No forfeit consumption was recorded against our package.
    const consumptions = await prisma.sessionConsumption.count({
      where: { clientProfileId: clientProfile.id },
    });
    expect(consumptions).toBe(0);
  });
});

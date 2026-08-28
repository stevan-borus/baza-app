/**
 * Package pause (POST /api/packages/pause) and end-pause
 * (POST /api/packages/pauses/[id]/end).
 *
 * Product decision under test: a pause is an ADMINISTRATIVE freeze of the
 * client's membership, not the client backing out of individual classes. So
 * creating one must, in a single transaction:
 *   - cancel every one of the client's FUTURE non-cancelled bookings whose
 *     session starts inside the window, with NO late-cancel forfeit ever
 *     (no SessionConsumption, no sessionsRemaining decrement) — however close
 *     the class was,
 *   - leave a session inside the window that already STARTED untouched (its
 *     attendance is history) and leave bookings outside the window alone,
 *   - release the client's waitlist seats for sessions in the window
 *     (regardless of class type — the client is paused entirely),
 *   - push each still-live package's expiresAt forward by the pause length,
 *     written to the COLUMN so every raw-expiresAt surface agrees.
 * After the transaction, each freed seat promotes the next waitlisted client,
 * and the paused client is notified.
 *
 * Ending a pause early gives the unused remainder back: expiresAt shrinks by
 * exactly the tail that never happened. Bookings already cancelled stay
 * cancelled — the seats may be taken by now, so restoring them is guesswork.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";
import { now, nowMs } from "@/lib/now";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST as POST_PAUSE } from "@/server/routes/packages/pause";
import { POST as POST_END_PAUSE } from "@/server/routes/packages/pauses/[id]/end";
import { GET as GET_CLIENT } from "@/server/routes/clients/[id]";
import { prisma } from "@/lib/server/prisma";
import { createSystemNotification } from "@/lib/server/notifications";

const createSystemNotificationMock = vi.mocked(createSystemNotification);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function seed() {
  const adminUser = await prisma.user.create({
    data: { email: "admin@pause.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const trainerUser = await prisma.user.create({
    data: { email: "trainer@pause.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@pause.local", firstName: "Client", lastName: "User", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: clientUser.id },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 8",
      sessionCount: 8,
      validityDays: 60,
      lateCancelHours: 12,
      price: 24000,
      classTypes: { create: { classTypeId: classType.id } },
    },
  });
  return { adminUser, trainerUser, clientUser, clientProfile, classType, packageType };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function createPackage(
  seeded: Seeded,
  opts?: { startsAt?: Date; expiresAt?: Date; sessionsRemaining?: number },
) {
  return prisma.clientPackage.create({
    data: {
      clientProfileId: seeded.clientProfile.id,
      packageTypeId: seeded.packageType.id,
      classTypes: { create: { classTypeId: seeded.classType.id } },
      lateCancelHours: 12,
      startsAt: opts?.startsAt ?? new Date(nowMs() - DAY),
      expiresAt: opts?.expiresAt ?? new Date(nowMs() + 60 * DAY),
      sessionsRemaining: opts?.sessionsRemaining ?? 6,
      sessionsGranted: opts?.sessionsRemaining ?? 6,
    },
  });
}

async function createSession(seeded: Seeded, startsAt: Date, capacity = 6) {
  return prisma.session.create({
    data: {
      classTypeId: seeded.classType.id,
      trainerUserId: seeded.trainerUser.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      capacity,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function makeOtherClient(seeded: Seeded, email: string) {
  const user = await prisma.user.create({
    data: { email, firstName: "Other", lastName: "Client", role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({ data: { userId: user.id } });
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: profile.id,
      packageTypeId: seeded.packageType.id,
      classTypes: { create: { classTypeId: seeded.classType.id } },
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - DAY),
      expiresAt: new Date(nowMs() + 60 * DAY),
      sessionsRemaining: 6,
      sessionsGranted: 6,
    },
  });
  return { user, profile, pkg };
}

function asAdmin(seeded: Seeded) {
  setMockUser({
    id: seeded.adminUser.id,
    role: "ADMIN",
    email: seeded.adminUser.email,
    isActive: true,
    clientProfile: null,
  });
}

function asTrainer(id: string) {
  setMockUser({
    id,
    role: "TRAINER",
    email: "trainer@pause.local",
    isActive: true,
    clientProfile: null,
  });
}

function pauseRequest(body: Record<string, unknown>) {
  return new Request("http://test.local/api/packages/pause", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function endPauseRequest(id: string) {
  return new Request(`http://test.local/api/packages/pauses/${id}/end`, {
    method: "POST",
  });
}

function clientRequest(userId: string) {
  return new Request(`http://test.local/api/clients/${userId}`);
}

beforeEach(async () => {
  await resetDb();
  createSystemNotificationMock.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/packages/pause cancels reservations in the window", () => {
  it("cancels the client's future bookings inside the window", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded);
    const session = await createSession(seeded, new Date(nowMs() + 3 * DAY));
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.canceledBookings).toBe(1);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.canceledAt).not.toBeNull();
  });

  it("leaves a session inside the window that already started untouched", async () => {
    // The pause window opened yesterday but the class ran this morning — that
    // attendance is history and must not be rewritten.
    const seeded = await seed();
    const pkg = await createPackage(seeded);
    const past = await createSession(seeded, new Date(nowMs() - 2 * HOUR));
    const booking = await prisma.booking.create({
      data: {
        sessionId: past.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() - DAY).toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.canceledAt).toBeNull();
  });

  it("leaves a booking OUTSIDE the window untouched", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded);
    const outside = await createSession(seeded, new Date(nowMs() + 20 * DAY));
    const booking = await prisma.booking.create({
      data: {
        sessionId: outside.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).canceledBookings).toBe(0);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.canceledAt).toBeNull();
  });

  it("never charges a late-cancel forfeit, even for a class starting in an hour", async () => {
    // The whole point: a pause is the studio's action. A 12h late-cancel
    // policy would normally burn a session for a class one hour out — pausing
    // must not, so nothing is consumed and no consumption row appears.
    const seeded = await seed();
    const pkg = await createPackage(seeded, { sessionsRemaining: 6 });
    const imminent = await createSession(seeded, new Date(nowMs() + HOUR));
    await prisma.booking.create({
      data: {
        sessionId: imminent.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const after = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(after.sessionsRemaining).toBe(6);
    expect(await prisma.sessionConsumption.count()).toBe(0);
  });

  it("releases the client's waitlist entries in the window", async () => {
    const seeded = await seed();
    await createPackage(seeded);
    const full = await createSession(seeded, new Date(nowMs() + 3 * DAY), 1);
    const other = await makeOtherClient(seeded, "taker@pause.local");
    await prisma.booking.create({
      data: {
        sessionId: full.id,
        clientProfileId: other.profile.id,
        clientPackageId: other.pkg.id,
      },
    });
    const entry = await prisma.waitlistEntry.create({
      data: {
        sessionId: full.id,
        clientProfileId: seeded.clientProfile.id,
        position: 1,
      },
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).removedWaitlistEntries).toBe(1);
    expect(await prisma.waitlistEntry.findUnique({ where: { id: entry.id } })).toBeNull();
  });

  it("promotes a waitlisted OTHER client into the seat the pause freed", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded);
    const session = await createSession(seeded, new Date(nowMs() + 3 * DAY), 1);
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    const other = await makeOtherClient(seeded, "waiting@pause.local");
    await prisma.waitlistEntry.create({
      data: {
        sessionId: session.id,
        clientProfileId: other.profile.id,
        position: 1,
      },
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const promoted = await prisma.booking.findFirst({
      where: { sessionId: session.id, clientProfileId: other.profile.id, canceledAt: null },
    });
    expect(promoted).not.toBeNull();
    expect(
      await prisma.waitlistEntry.count({ where: { sessionId: session.id } }),
    ).toBe(0);
  });

  it("notifies the paused client with the cancelled count and the new expiry", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded);
    const session = await createSession(seeded, new Date(nowMs() + 3 * DAY));
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const clientCalls = createSystemNotificationMock.mock.calls.filter(
      (call) => call[0] === seeded.clientUser.id && call[1] === "PACKAGE_PAUSED",
    );
    expect(clientCalls).toHaveLength(1);
    expect(clientCalls[0][2]).toBe("GENERAL");
    const updated = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(clientCalls[0][3]).toMatchObject({
      canceledBookings: 1,
      expiresAt: updated.expiresAt.toISOString(),
    });
    // The admin who paused is never notified.
    expect(
      createSystemNotificationMock.mock.calls.filter((c) => c[0] === seeded.adminUser.id),
    ).toEqual([]);
  });
});

describe("POST /api/packages/pause extends expiresAt", () => {
  it("pushes expiresAt forward by the full pause length, immediately", async () => {
    const seeded = await seed();
    const expiresAt = new Date(nowMs() + 20 * DAY);
    const pkg = await createPackage(seeded, { expiresAt });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const after = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(after.expiresAt.getTime()).toBe(expiresAt.getTime() + 7 * DAY);
  });

  it("does not resurrect a package that expired before the pause began", async () => {
    const seeded = await seed();
    const expiresAt = new Date(nowMs() - 5 * DAY);
    const dead = await createPackage(seeded, {
      startsAt: new Date(nowMs() - 40 * DAY),
      expiresAt,
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const after = await prisma.clientPackage.findUniqueOrThrow({ where: { id: dead.id } });
    expect(after.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it("credits only the overlap when the pause starts before the package does", async () => {
    // A pause that opens before the pack's own startsAt froze nothing for the
    // first stretch, so only the overlapping tail is credited.
    const seeded = await seed();
    const startsAt = new Date(nowMs() + 3 * DAY);
    const expiresAt = new Date(nowMs() + 33 * DAY);
    const pkg = await createPackage(seeded, { startsAt, expiresAt });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const after = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(after.expiresAt.getTime()).toBe(expiresAt.getTime() + 4 * DAY);
  });

  it("leaves a revoked package's expiresAt alone", async () => {
    const seeded = await seed();
    const expiresAt = new Date(nowMs() + 20 * DAY);
    const pkg = await createPackage(seeded, { expiresAt });
    await prisma.clientPackage.update({
      where: { id: pkg.id },
      data: { revokedAt: now() },
    });

    asAdmin(seeded);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const after = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(after.expiresAt.getTime()).toBe(expiresAt.getTime());
  });
});

describe("POST /api/packages/pause rejects overlapping pauses", () => {
  it("returns 409 when the new window overlaps an existing pause", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded, { expiresAt: new Date(nowMs() + 20 * DAY) });

    asAdmin(seeded);
    const first = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(first.status).toBe(201);
    const afterFirst = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });

    const second = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() + 5 * DAY).toISOString(),
        endsAt: new Date(nowMs() + 12 * DAY).toISOString(),
      }),
    );
    expect(second.status).toBe(409);
    expect(await prisma.packagePause.count()).toBe(1);
    // The rejected pause must not have double-credited the extension.
    const afterSecond = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(afterSecond.expiresAt.getTime()).toBe(afterFirst.expiresAt.getTime());
  });

  it("allows a back-to-back pause that only touches at the boundary", async () => {
    const seeded = await seed();
    asAdmin(seeded);
    const first = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(first.status).toBe(201);

    const second = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() + 7 * DAY).toISOString(),
        endsAt: new Date(nowMs() + 10 * DAY).toISOString(),
      }),
    );
    expect(second.status).toBe(201);
    expect(await prisma.packagePause.count()).toBe(2);
  });

  it("ignores another client's overlapping pause", async () => {
    const seeded = await seed();
    const other = await makeOtherClient(seeded, "unrelated@pause.local");
    asAdmin(seeded);
    await POST_PAUSE(
      pauseRequest({
        clientProfileId: other.profile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /api/packages/pauses/[id]/end", () => {
  it("shrinks expiresAt back by the unused remainder", async () => {
    const seeded = await seed();
    const expiresAt = new Date(nowMs() + 20 * DAY);
    // Started well before the pause, so the pause overlaps it end to end.
    const pkg = await createPackage(seeded, {
      startsAt: new Date(nowMs() - 30 * DAY),
      expiresAt,
    });

    asAdmin(seeded);
    // A 10-day pause that started 4 days ago: 6 days are still unused.
    const created = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() - 4 * DAY).toISOString(),
        endsAt: new Date(nowMs() + 6 * DAY).toISOString(),
      }),
    );
    expect(created.status).toBe(201);
    const { pause } = await created.json();

    const extended = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(extended.expiresAt.getTime()).toBe(expiresAt.getTime() + 10 * DAY);

    const ended = await POST_END_PAUSE(endPauseRequest(pause.id), { id: pause.id });
    expect(ended.status).toBe(200);

    const shrunk = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(shrunk.expiresAt.getTime()).toBe(expiresAt.getTime() + 4 * DAY);
    // The pause row survives, truncated to the moment it actually ended.
    const row = await prisma.packagePause.findUniqueOrThrow({ where: { id: pause.id } });
    expect(row.endsAt.getTime()).toBe(nowMs());
  });

  it("gives back the whole extension when the pause had not started yet", async () => {
    const seeded = await seed();
    const expiresAt = new Date(nowMs() + 20 * DAY);
    const pkg = await createPackage(seeded, { expiresAt });

    asAdmin(seeded);
    const created = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() + 2 * DAY).toISOString(),
        endsAt: new Date(nowMs() + 9 * DAY).toISOString(),
      }),
    );
    const { pause } = await created.json();

    const ended = await POST_END_PAUSE(endPauseRequest(pause.id), { id: pause.id });
    expect(ended.status).toBe(200);

    const shrunk = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(shrunk.expiresAt.getTime()).toBe(expiresAt.getTime());
    // A pause that never ran leaves no row behind.
    expect(await prisma.packagePause.findUnique({ where: { id: pause.id } })).toBeNull();
  });

  it("does NOT restore bookings the pause cancelled", async () => {
    // Deliberate: the freed seats may already be taken by promoted clients,
    // so re-booking would be guesswork. The client re-books themselves.
    const seeded = await seed();
    const pkg = await createPackage(seeded);
    const session = await createSession(seeded, new Date(nowMs() + 3 * DAY));
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asAdmin(seeded);
    const created = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    const { pause } = await created.json();

    const ended = await POST_END_PAUSE(endPauseRequest(pause.id), { id: pause.id });
    expect(ended.status).toBe(200);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.canceledAt).not.toBeNull();
  });

  it("returns 404 for an unknown pause", async () => {
    const seeded = await seed();
    asAdmin(seeded);
    const res = await POST_END_PAUSE(
      endPauseRequest("00000000-0000-0000-0000-000000000000"),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 for a pause that already finished", async () => {
    const seeded = await seed();
    await createPackage(seeded);
    const finished = await prisma.packagePause.create({
      data: {
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() - 20 * DAY),
        endsAt: new Date(nowMs() - 10 * DAY),
      },
    });

    asAdmin(seeded);
    const res = await POST_END_PAUSE(endPauseRequest(finished.id), { id: finished.id });
    expect(res.status).toBe(409);
  });
});

describe("trainer scoping", () => {
  it("a trainer not linked to the client gets 403 on pause", async () => {
    const seeded = await seed();
    asTrainer(seeded.trainerUser.id);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(403);
    expect(await prisma.packagePause.count()).toBe(0);
  });

  it("a trainer not linked to the client gets 403 on end-pause", async () => {
    const seeded = await seed();
    const pause = await prisma.packagePause.create({
      data: {
        clientProfileId: seeded.clientProfile.id,
        startsAt: now(),
        endsAt: new Date(nowMs() + 7 * DAY),
      },
    });

    asTrainer(seeded.trainerUser.id);
    const res = await POST_END_PAUSE(endPauseRequest(pause.id), { id: pause.id });
    expect(res.status).toBe(403);
    expect(
      (await prisma.packagePause.findUniqueOrThrow({ where: { id: pause.id } })).endsAt.getTime(),
    ).toBe(nowMs() + 7 * DAY);
  });

  it("a trainer linked to the client may pause them", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded);
    // A trainer is "linked" through an active booking on one of their sessions.
    const linkSession = await createSession(seeded, new Date(nowMs() + 30 * DAY));
    await prisma.booking.create({
      data: {
        sessionId: linkSession.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asTrainer(seeded.trainerUser.id);
    const res = await POST_PAUSE(
      pauseRequest({
        clientProfileId: seeded.clientProfile.id,
        startsAt: now().toISOString(),
        endsAt: new Date(nowMs() + 7 * DAY).toISOString(),
      }),
    );
    expect(res.status).toBe(201);
  });
});

// The admin UI needs a pause id to end one, and the client-detail screen is
// the only surface that offers the action. It reads GET /api/clients/[id],
// so that payload has to carry the running pause — the derived
// `packageStatus: "paused"` alone says a pause exists but not which one.
describe("GET /api/clients/[id] exposes the active pause", () => {
  it("returns the running pause alongside packageStatus paused", async () => {
    const seeded = await seed();
    await createPackage(seeded);
    const pause = await prisma.packagePause.create({
      data: {
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() - DAY),
        endsAt: new Date(nowMs() + 7 * DAY),
      },
    });

    asAdmin(seeded);
    const res = await GET_CLIENT(clientRequest(seeded.clientUser.id), {
      id: seeded.clientUser.id,
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.client.packageStatus).toBe("paused");
    expect(body.client.activePause).toMatchObject({
      id: pause.id,
      startsAt: pause.startsAt.toISOString(),
      endsAt: pause.endsAt.toISOString(),
    });
  });

  it("returns activePause null when the client is not paused", async () => {
    const seeded = await seed();
    await createPackage(seeded);

    asAdmin(seeded);
    const res = await GET_CLIENT(clientRequest(seeded.clientUser.id), {
      id: seeded.clientUser.id,
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.client.packageStatus).not.toBe("paused");
    expect(body.client.activePause).toBeNull();
  });

  it("returns activePause null for a pause that has already finished", async () => {
    const seeded = await seed();
    await createPackage(seeded);
    await prisma.packagePause.create({
      data: {
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() - 20 * DAY),
        endsAt: new Date(nowMs() - 10 * DAY),
      },
    });

    asAdmin(seeded);
    const res = await GET_CLIENT(clientRequest(seeded.clientUser.id), {
      id: seeded.clientUser.id,
    });
    const body = await res.json();

    expect(body.client.activePause).toBeNull();
  });

  it("stops reporting an active pause once it is ended early", async () => {
    const seeded = await seed();
    await createPackage(seeded);
    const pause = await prisma.packagePause.create({
      data: {
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() - DAY),
        endsAt: new Date(nowMs() + 7 * DAY),
      },
    });

    asAdmin(seeded);
    const ended = await POST_END_PAUSE(endPauseRequest(pause.id), { id: pause.id });
    expect(ended.status).toBe(200);

    const res = await GET_CLIENT(clientRequest(seeded.clientUser.id), {
      id: seeded.clientUser.id,
    });
    const body = await res.json();
    // Ending truncates the window to exactly now, and the active-pause read is
    // half-open, so the pause stops counting as running the moment it ends.
    // The alternative (an inclusive bound) leaves the admin staring at a
    // "Pauziran" pill over an end-pause button that answers 409.
    expect(body.client.activePause).toBeNull();
    expect(body.client.packageStatus).not.toBe("paused");

    // The ROW itself survives, truncated rather than deleted — the stretch the
    // client actually spent frozen stays on the record.
    const stored = await prisma.packagePause.findUnique({
      where: { id: pause.id },
      select: { endsAt: true },
    });
    expect(stored?.endsAt.toISOString()).toBe(now().toISOString());
  });

  it("drops activePause for a pause that was deleted by ending it before it started", async () => {
    const seeded = await seed();
    await createPackage(seeded);
    const pause = await prisma.packagePause.create({
      data: {
        clientProfileId: seeded.clientProfile.id,
        startsAt: new Date(nowMs() + 2 * DAY),
        endsAt: new Date(nowMs() + 9 * DAY),
      },
    });

    asAdmin(seeded);
    await POST_END_PAUSE(endPauseRequest(pause.id), { id: pause.id });

    const res = await GET_CLIENT(clientRequest(seeded.clientUser.id), {
      id: seeded.clientUser.id,
    });
    const body = await res.json();
    expect(body.client.activePause).toBeNull();
  });
});

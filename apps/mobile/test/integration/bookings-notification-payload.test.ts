/**
 * Coverage for the notification side-effects on POST /api/bookings:
 *
 * 1. BOOKING_CONFIRMED is NOT dispatched for self-initiated bookings —
 *    the booking sheet shows an inline success block, so a persistent
 *    notification would just be noise. (It is still dispatched for
 *    waitlist→spot promotions, which happen async.)
 * 2. Cancellation notifications to admins + the trainer carry the
 *    `clientFullName`, `classTypeName`, `sessionStartsAt`, and `isLate`
 *    fields in their payload so the inbox can interpolate
 *    "{{clientFullName}} je otkazao {{classTypeName}} ({{time}})."
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/bookings";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";
import { createSystemNotification } from "@/lib/server/notifications";

const createSystemNotificationMock = vi.mocked(createSystemNotification);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function fixtures() {
  const admin = await prisma.user.create({
    data: { email: "adm-npt@t.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "tr-npt@t.local", firstName: "Trainer", lastName: "Reformer", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "cl-npt@t.local", firstName: "Marko", lastName: "Petrović", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 365,
      lateCancelHours: 8,
      classTypeId: reformer.id,
    },
  });
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: clientProfile.id,
      packageTypeId: packageType.id,
      classTypeId: reformer.id,
      lateCancelHours: 8,
      startsAt: new Date(nowMs() - DAY_MS),
      expiresAt: new Date(nowMs() + 90 * DAY_MS),
      sessionsRemaining: 12,
    },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala", capacity: 6 },
  });
  return { admin, trainer, client, clientProfile, reformer, room, pkg };
}

async function bookableSession(opts: {
  classTypeId: string;
  roomId: string;
  trainerUserId: string;
  startsAt?: Date;
}) {
  const startsAt = opts.startsAt ?? new Date(nowMs() + 2 * DAY_MS);
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      roomId: opts.roomId,
      trainerUserId: opts.trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      capacity: 6,
      status: "SCHEDULED",
    },
  });
}

function bookReq(sessionId: string) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "BOOK", sessionId }),
  });
}

function cancelReq(sessionId: string) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "CANCEL", sessionId }),
  });
}

describe("POST /api/bookings — notification payload", () => {
  beforeEach(async () => {
    await resetDb();
    createSystemNotificationMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("does NOT dispatch a BOOKING_CONFIRMED notification on self-initiated booking", async () => {
    const { trainer, client, clientProfile, reformer, room } = await fixtures();
    const session = await bookableSession({
      classTypeId: reformer.id,
      roomId: room.id,
      trainerUserId: trainer.id,
    });
    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await POST(bookReq(session.id));
    expect(res.status).toBe(200);

    // No call to the client themselves with BOOKING_CONFIRMED — the inline
    // success block in the sheet covers this case.
    const clientNotifications = createSystemNotificationMock.mock.calls.filter(
      (c) => c[0] === client.id,
    );
    expect(clientNotifications).toEqual([]);
  });

  it("cancellation notifications carry clientFullName, classTypeName, sessionStartsAt, isLate", async () => {
    // Sub-mock notify-operators' payload assembly by spying through
    // the same `createSystemNotification` mock. Cancellation triggers
    // dispatches for the trainer and (no separate admin in this minimal
    // fixture set), so we check at least the trainer call.
    const { admin, trainer, client, clientProfile, reformer, room, pkg } = await fixtures();
    // Session 4 days out so cancellation is *not* late (lateCancelHours=8).
    const session = await bookableSession({
      classTypeId: reformer.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 4 * DAY_MS),
    });
    // Existing booking before we test cancel.
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });
    createSystemNotificationMock.mockClear();

    const res = await POST(cancelReq(session.id));
    expect(res.status).toBe(200);

    // notifyOperators() is fire-and-forget (the route doesn't await it) and
    // dispatches to each operator independently, so poll until both the
    // trainer and admin calls land rather than racing a fixed delay — the DB
    // round-trips are far slower against a remote branch (CI) than localhost.
    const [trainerCall, adminCall] = await vi.waitFor(
      () => {
        const t = createSystemNotificationMock.mock.calls.find((c) => c[0] === trainer.id);
        const a = createSystemNotificationMock.mock.calls.find((c) => c[0] === admin.id);
        expect(t).toBeDefined();
        expect(a).toBeDefined();
        return [t, a] as const;
      },
      { timeout: 15_000, interval: 50 },
    );
    const payload = trainerCall![3] as Record<string, unknown>;
    expect(payload.clientFullName).toBe("Marko Petrović");
    expect(payload.classTypeName).toBe("Reformer pilates");
    expect(typeof payload.sessionStartsAt).toBe("string");
    expect(payload.isLate).toBe(false);

    const adminPayload = adminCall![3] as Record<string, unknown>;
    expect(adminPayload.clientFullName).toBe("Marko Petrović");
  });

  it("late cancellations mark isLate=true in payload", async () => {
    const { trainer, client, clientProfile, reformer, room, pkg } = await fixtures();
    // Session 2 hours out, lateCancelHours=8 → cancellation is LATE.
    const session = await bookableSession({
      classTypeId: reformer.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 2 * HOUR_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });
    createSystemNotificationMock.mockClear();

    await POST(cancelReq(session.id));

    // Poll for the fire-and-forget operator notification (see the note above).
    const trainerCall = await vi.waitFor(
      () => {
        const t = createSystemNotificationMock.mock.calls.find((c) => c[0] === trainer.id);
        expect(t).toBeDefined();
        return t;
      },
      { timeout: 15_000, interval: 50 },
    );
    const payload = trainerCall![3] as Record<string, unknown>;
    expect(payload.isLate).toBe(true);
  });
});

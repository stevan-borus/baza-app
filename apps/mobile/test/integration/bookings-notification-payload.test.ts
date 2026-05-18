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

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role))
        return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/bookings/+api";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";
import { createSystemNotification } from "@/lib/server/notifications";

const createSystemNotificationMock = vi.mocked(createSystemNotification);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function fixtures() {
  const admin = await prisma.user.create({
    data: { email: "adm-npt@t.local", fullName: "Admin", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "tr-npt@t.local", fullName: "Trainer Reformer", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "cl-npt@t.local", fullName: "Marko Petrović", role: "CLIENT" },
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
    // Sub-mock notify-cancellation's payload assembly by spying through
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

    // Wait a tick for the fire-and-forget notifyCancellation() promise to
    // resolve (the route doesn't await it).
    await new Promise((r) => setTimeout(r, 50));

    const trainerCall = createSystemNotificationMock.mock.calls.find(
      (c) => c[0] === trainer.id,
    );
    expect(trainerCall).toBeDefined();
    const payload = trainerCall![3] as Record<string, unknown>;
    expect(payload.clientFullName).toBe("Marko Petrović");
    expect(payload.classTypeName).toBe("Reformer pilates");
    expect(typeof payload.sessionStartsAt).toBe("string");
    expect(payload.isLate).toBe(false);

    const adminCall = createSystemNotificationMock.mock.calls.find(
      (c) => c[0] === admin.id,
    );
    expect(adminCall).toBeDefined();
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
    await new Promise((r) => setTimeout(r, 50));

    const trainerCall = createSystemNotificationMock.mock.calls.find(
      (c) => c[0] === trainer.id,
    );
    expect(trainerCall).toBeDefined();
    const payload = trainerCall![3] as Record<string, unknown>;
    expect(payload.isLate).toBe(true);
  });
});

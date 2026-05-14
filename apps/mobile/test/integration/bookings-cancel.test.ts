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

async function seedBaseline() {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", fullName: "Trainer", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "client@test.local", fullName: "Client", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12-pack",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  const clientPackage = await prisma.clientPackage.create({
    data: {
      clientProfileId: clientProfile.id,
      packageTypeId: packageType.id,
      classTypeId: reformer.id,
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - 5 * DAY_MS),
      expiresAt: new Date(nowMs() + 30 * DAY_MS),
      sessionsRemaining: 8,
    },
  });
  return { trainer, client, clientProfile, reformer, clientPackage };
}

async function createFutureSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAtMsFromNow: number;
  capacity?: number;
}) {
  const startsAt = new Date(nowMs() + opts.startsAtMsFromNow);
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      capacity: opts.capacity ?? 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

function buildClientCancelRequest(sessionId: string) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "CANCEL", sessionId }),
  });
}

function asClient(opts: { id: string; profileId: string; email: string }) {
  setMockUser({
    id: opts.id,
    role: "CLIENT",
    email: opts.email,
    isActive: true,
    clientProfile: { id: opts.profileId },
  });
}

describe("POST /api/bookings cancel", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("cancels before the cutoff with no consumption and no pack decrement", async () => {
    const { trainer, client, clientProfile, reformer, clientPackage } =
      await seedBaseline();
    // Session 48h away, lateCancelHours = 12 → cancellation now is well outside.
    const session = await createFutureSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAtMsFromNow: 48 * HOUR_MS,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: clientPackage.id,
      },
    });
    asClient({ id: client.id, profileId: clientProfile.id, email: client.email });

    const response = await POST(buildClientCancelRequest(session.id));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: string };
    expect(body.state).toBe("CANCELED");

    const pack = await prisma.clientPackage.findUnique({
      where: { id: clientPackage.id },
    });
    expect(pack?.sessionsRemaining).toBe(8);
    const consumption = await prisma.sessionConsumption.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(consumption).toBeNull();
    const booking = await prisma.booking.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(booking?.canceledAt).not.toBeNull();
  });

  it("late cancel (inside cutoff) consumes a session and decrements the pack", async () => {
    const { trainer, client, clientProfile, reformer, clientPackage } =
      await seedBaseline();
    // Session 6h away, lateCancelHours = 12 → cancellation now is INSIDE the window.
    const session = await createFutureSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAtMsFromNow: 6 * HOUR_MS,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: clientPackage.id,
      },
    });
    asClient({ id: client.id, profileId: clientProfile.id, email: client.email });

    const response = await POST(buildClientCancelRequest(session.id));
    expect(response.status).toBe(200);

    const pack = await prisma.clientPackage.findUnique({
      where: { id: clientPackage.id },
    });
    expect(pack?.sessionsRemaining).toBe(7);
    const consumption = await prisma.sessionConsumption.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(consumption).not.toBeNull();
  });

  it("does not double-debit the pack on a repeated late-cancel call (idempotent)", async () => {
    const { trainer, client, clientProfile, reformer, clientPackage } =
      await seedBaseline();
    const session = await createFutureSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAtMsFromNow: 6 * HOUR_MS,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: clientPackage.id,
      },
    });
    asClient({ id: client.id, profileId: clientProfile.id, email: client.email });

    await POST(buildClientCancelRequest(session.id));
    await POST(buildClientCancelRequest(session.id));

    const pack = await prisma.clientPackage.findUnique({
      where: { id: clientPackage.id },
    });
    expect(pack?.sessionsRemaining).toBe(7);
    const consumptions = await prisma.sessionConsumption.findMany({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(consumptions).toHaveLength(1);
  });

  it("returns 404 when canceling for a session that does not exist", async () => {
    const { client, clientProfile } = await seedBaseline();
    asClient({ id: client.id, profileId: clientProfile.id, email: client.email });

    const response = await POST(
      buildClientCancelRequest("00000000-0000-0000-0000-000000000000"),
    );
    expect(response.status).toBe(404);
  });

  it("promotes the first waitlisted client to a confirmed booking", async () => {
    const { trainer, client, clientProfile, reformer, clientPackage } =
      await seedBaseline();
    const session = await createFutureSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAtMsFromNow: 48 * HOUR_MS,
      capacity: 1,
    });
    // Active booking by the first client.
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: clientPackage.id,
      },
    });

    // Second client + eligible pack + waitlist entry.
    const client2 = await prisma.user.create({
      data: { email: "client2@test.local", fullName: "Client 2", role: "CLIENT" },
    });
    const clientProfile2 = await prisma.clientProfile.create({
      data: { userId: client2.id },
    });
    const packageType2 = await prisma.packageType.findFirstOrThrow({
      where: { classTypeId: reformer.id },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: clientProfile2.id,
        packageTypeId: packageType2.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: new Date(nowMs() - DAY_MS),
        expiresAt: new Date(nowMs() + 30 * DAY_MS),
        sessionsRemaining: 8,
      },
    });
    await prisma.waitlistEntry.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile2.id,
        position: 1,
      },
    });

    asClient({ id: client.id, profileId: clientProfile.id, email: client.email });
    const response = await POST(buildClientCancelRequest(session.id));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: string };
    expect(body.state).toBe("WAITLIST_PROMOTED");

    const promotedBooking = await prisma.booking.findFirst({
      where: {
        sessionId: session.id,
        clientProfileId: clientProfile2.id,
        canceledAt: null,
      },
    });
    expect(promotedBooking).not.toBeNull();
    const remainingWaitlist = await prisma.waitlistEntry.count({
      where: { sessionId: session.id },
    });
    expect(remainingWaitlist).toBe(0);
  });

  describe("cancellation fan-out", () => {
    beforeEach(() => {
      createSystemNotificationMock.mockClear();
    });

    it("late cancel produces skipPush=false for the trainer", async () => {
      const baseline = await seedBaseline();
      const session = await createFutureSession({
        classTypeId: baseline.reformer.id,
        trainerUserId: baseline.trainer.id,
        startsAtMsFromNow: 2 * HOUR_MS, // <12h cutoff = late
      });
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: baseline.clientProfile.id,
          clientPackageId: baseline.clientPackage.id,
        },
      });
      asClient({ id: baseline.client.id, profileId: baseline.clientProfile.id, email: baseline.client.email });

      createSystemNotificationMock.mockClear();
      const res = await POST(buildClientCancelRequest(session.id));
      expect(res.status).toBe(200);

      // Trainer should get a push (skipPush=false).
      // Fan-out is fire-and-forget; wait for the trainer call to land.
      await vi.waitFor(() => {
        const found = createSystemNotificationMock.mock.calls.find(
          (call) => call[0] === baseline.trainer.id && call[2] === "BOOKING_CANCELED_TRAINER",
        );
        expect(found).toBeDefined();
      });
      const trainerCall = createSystemNotificationMock.mock.calls.find(
        (call) => call[0] === baseline.trainer.id && call[2] === "BOOKING_CANCELED_TRAINER",
      );
      expect(trainerCall).toBeDefined();
      expect(trainerCall![4]).toMatchObject({ skipPush: false });
    });

    it("early cancel produces skipPush=true (silent) for the trainer", async () => {
      const baseline = await seedBaseline();
      const session = await createFutureSession({
        classTypeId: baseline.reformer.id,
        trainerUserId: baseline.trainer.id,
        startsAtMsFromNow: 48 * HOUR_MS, // far before cutoff = early
      });
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: baseline.clientProfile.id,
          clientPackageId: baseline.clientPackage.id,
        },
      });
      asClient({ id: baseline.client.id, profileId: baseline.clientProfile.id, email: baseline.client.email });

      createSystemNotificationMock.mockClear();
      const res = await POST(buildClientCancelRequest(session.id));
      expect(res.status).toBe(200);

      await vi.waitFor(() => {
        const found = createSystemNotificationMock.mock.calls.find(
          (call) => call[0] === baseline.trainer.id && call[2] === "BOOKING_CANCELED_TRAINER",
        );
        expect(found).toBeDefined();
      });
      const trainerCall = createSystemNotificationMock.mock.calls.find(
        (call) => call[0] === baseline.trainer.id && call[2] === "BOOKING_CANCELED_TRAINER",
      );
      expect(trainerCall).toBeDefined();
      expect(trainerCall![4]).toMatchObject({ skipPush: true });
    });

    it("every active admin receives BOOKING_CANCELED_ADMIN", async () => {
      const baseline = await seedBaseline();
      const admin1 = await prisma.user.create({
        data: { email: "admin1@test.local", fullName: "Admin One", role: "ADMIN" },
      });
      const admin2 = await prisma.user.create({
        data: { email: "admin2@test.local", fullName: "Admin Two", role: "ADMIN" },
      });
      const session = await createFutureSession({
        classTypeId: baseline.reformer.id,
        trainerUserId: baseline.trainer.id,
        startsAtMsFromNow: 2 * HOUR_MS,
      });
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: baseline.clientProfile.id,
          clientPackageId: baseline.clientPackage.id,
        },
      });
      asClient({ id: baseline.client.id, profileId: baseline.clientProfile.id, email: baseline.client.email });

      createSystemNotificationMock.mockClear();
      await POST(buildClientCancelRequest(session.id));

      await vi.waitFor(() => {
        const adminCalls = createSystemNotificationMock.mock.calls.filter(
          (call) => call[2] === "BOOKING_CANCELED_ADMIN",
        );
        expect(adminCalls).toHaveLength(2);
      });
      const adminCalls = createSystemNotificationMock.mock.calls.filter(
        (call) => call[2] === "BOOKING_CANCELED_ADMIN",
      );
      const notifiedAdminIds = adminCalls.map((call) => call[0]).sort();
      expect(notifiedAdminIds).toEqual([admin1.id, admin2.id].sort());
    });

    it("trainer-also-admin receives only one notification (trainer variant)", async () => {
      const baseline = await seedBaseline();
      // Promote the trainer to ADMIN too (rare but possible).
      await prisma.user.update({
        where: { id: baseline.trainer.id },
        data: { role: "ADMIN" },
      });
      const session = await createFutureSession({
        classTypeId: baseline.reformer.id,
        trainerUserId: baseline.trainer.id,
        startsAtMsFromNow: 2 * HOUR_MS,
      });
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: baseline.clientProfile.id,
          clientPackageId: baseline.clientPackage.id,
        },
      });
      asClient({ id: baseline.client.id, profileId: baseline.clientProfile.id, email: baseline.client.email });

      createSystemNotificationMock.mockClear();
      await POST(buildClientCancelRequest(session.id));

      await vi.waitFor(() => {
        const calls = createSystemNotificationMock.mock.calls.filter(
          (call) => call[0] === baseline.trainer.id,
        );
        expect(calls).toHaveLength(1);
      });
      const callsForTrainerUser = createSystemNotificationMock.mock.calls.filter(
        (call) => call[0] === baseline.trainer.id,
      );
      expect(callsForTrainerUser).toHaveLength(1);
      expect(callsForTrainerUser[0][2]).toBe("BOOKING_CANCELED_TRAINER");
    });
  });
});

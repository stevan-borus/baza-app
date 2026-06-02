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

type NotifyArgs = [
  userId: string,
  messageKey: string,
  type: string,
  payload: Record<string, unknown>,
  options?: { dedupeKey?: string; skipPush?: boolean },
];
const createSystemNotificationMock = vi.fn(async (..._args: NotifyArgs) => {
  return undefined as unknown;
});
vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: (...args: NotifyArgs) =>
    createSystemNotificationMock(...args),
}));

import { POST } from "@/app/api/admin/reservations/cancel-bulk/+api";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

async function seedBasics() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const adminOther = await prisma.user.create({
    data: { email: "admin2@test.local", firstName: "Admin", lastName: "Two", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Marija", lastName: "Klijent", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: clientUser.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  return { admin, adminOther, trainer, clientUser, clientProfile, reformer };
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
    },
  });
}

function buildRequest(body: unknown) {
  return new Request("http://test.local/api/admin/reservations/cancel-bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function asAdmin(admin: { id: string; email: string }) {
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
}

describe("POST /api/admin/reservations/cancel-bulk", () => {
  beforeEach(async () => {
    await resetDb();
    createSystemNotificationMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("cancels all provided bookings and reports the count", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const session1 = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 7 * 24 * 60 * 60 * 1000),
    });
    const session2 = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 8 * 24 * 60 * 60 * 1000),
    });
    const b1 = await prisma.booking.create({
      data: {
        sessionId: session1.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });
    const b2 = await prisma.booking.create({
      data: {
        sessionId: session2.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });
    asAdmin(admin);

    const res = await POST(buildRequest({ bookingIds: [b1.id, b2.id] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canceled).toBe(2);

    const stillActive = await prisma.booking.count({
      where: { id: { in: [b1.id, b2.id] }, canceledAt: null },
    });
    expect(stillActive).toBe(0);
  });

  it("collapses notifications: one per other admin, one per affected trainer, none to initiator", async () => {
    const { admin, adminOther, trainer, clientProfile, reformer } = await seedBasics();
    const session1 = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 7 * 24 * 60 * 60 * 1000),
    });
    const session2 = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 8 * 24 * 60 * 60 * 1000),
    });
    const b1 = await prisma.booking.create({
      data: {
        sessionId: session1.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });
    const b2 = await prisma.booking.create({
      data: {
        sessionId: session2.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });
    asAdmin(admin);

    const res = await POST(buildRequest({ bookingIds: [b1.id, b2.id] }));
    expect(res.status).toBe(200);

    // Wait for fire-and-forget notification dispatch to settle.
    await new Promise((r) => setImmediate(r));

    const recipientCalls = createSystemNotificationMock.mock.calls.map(
      (call) => ({ userId: call[0], type: call[2] }),
    );
    const recipientIds = recipientCalls.map((c) => c.userId);

    // Initiating admin: 0 calls
    expect(recipientIds.filter((id) => id === admin.id)).toEqual([]);
    // Other admin: exactly 1 call
    expect(recipientIds.filter((id) => id === adminOther.id)).toHaveLength(1);
    // Trainer: exactly 1 call (both bookings hit the same trainer)
    expect(recipientIds.filter((id) => id === trainer.id)).toHaveLength(1);
    // Types match the new enum values
    const adminTypes = recipientCalls
      .filter((c) => c.userId === adminOther.id)
      .map((c) => c.type);
    expect(adminTypes).toContain("BULK_RESERVATION_CANCEL_ADMIN");
    const trainerTypes = recipientCalls
      .filter((c) => c.userId === trainer.id)
      .map((c) => c.type);
    expect(trainerTypes).toContain("BULK_RESERVATION_CANCEL_TRAINER");
  });

  it("promotes the next waitlisted client per session (independent promotions)", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 7 * 24 * 60 * 60 * 1000),
      capacity: 1,
    });
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        createdByUserId: admin.id,
      },
    });
    // Set up a waitlisted other client with a valid package.
    const otherUser = await prisma.user.create({
      data: { email: "other@test.local", firstName: "Other", lastName: "Client", role: "CLIENT" },
    });
    const otherProfile = await prisma.clientProfile.create({
      data: { userId: otherUser.id },
    });
    const packageType = await prisma.packageType.create({
      data: {
        name: "Reformer 12-pack",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 8,
        classTypeId: reformer.id,
      },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: otherProfile.id,
        packageTypeId: packageType.id,
        classTypeId: reformer.id,
        lateCancelHours: 8,
        startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
        expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
        sessionsRemaining: 12,
      },
    });
    await prisma.waitlistEntry.create({
      data: {
        sessionId: session.id,
        clientProfileId: otherProfile.id,
        position: 1,
      },
    });
    asAdmin(admin);

    await POST(buildRequest({ bookingIds: [booking.id] }));

    const promoted = await prisma.booking.findFirst({
      where: { sessionId: session.id, clientProfileId: otherProfile.id, canceledAt: null },
    });
    expect(promoted).not.toBeNull();
    const remainingWaitlist = await prisma.waitlistEntry.count({
      where: { sessionId: session.id },
    });
    expect(remainingWaitlist).toBe(0);
  });

  it("forbids non-admins (403)", async () => {
    const { trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 7 * 24 * 60 * 60 * 1000),
    });
    const booking = await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await POST(buildRequest({ bookingIds: [booking.id] }));
    expect(res.status).toBe(403);
  });

  it("rejects empty bookingIds with 400", async () => {
    const { admin } = await seedBasics();
    asAdmin(admin);
    const res = await POST(buildRequest({ bookingIds: [] }));
    expect(res.status).toBe(400);
  });

  describe("charge waiver", () => {
    // Builds a late, package-backed booking: session 1h out, lateCancelHours 8 → inside cutoff.
    async function seedLateBackedBooking() {
      const { admin, trainer, clientProfile, reformer } = await seedBasics();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + 60 * 60 * 1000),
      });
      const packageType = await prisma.packageType.create({
        data: {
          name: "Reformer 12-pack",
          sessionCount: 12,
          validityDays: 30,
          lateCancelHours: 8,
          classTypeId: reformer.id,
        },
      });
      const pack = await prisma.clientPackage.create({
        data: {
          clientProfileId: clientProfile.id,
          packageTypeId: packageType.id,
          classTypeId: reformer.id,
          lateCancelHours: 8,
          startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
          expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
          sessionsRemaining: 8,
        },
      });
      const booking = await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: clientProfile.id,
          clientPackageId: pack.id,
          createdByUserId: admin.id,
        },
      });
      return { admin, clientProfile, session, pack, booking };
    }

    it("with waiveCharge does not consume the session and stamps waivedByUserId", async () => {
      const { admin, clientProfile, session, pack, booking } =
        await seedLateBackedBooking();
      asAdmin(admin);

      const res = await POST(
        buildRequest({ bookingIds: [booking.id], waiveCharge: true }),
      );
      expect(res.status).toBe(200);

      const after = await prisma.clientPackage.findUnique({ where: { id: pack.id } });
      expect(after?.sessionsRemaining).toBe(8); // unchanged

      const consumption = await prisma.sessionConsumption.findUnique({
        where: {
          clientProfileId_sessionId: {
            clientProfileId: clientProfile.id,
            sessionId: session.id,
          },
        },
      });
      expect(consumption).toBeNull();

      const stamped = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(stamped?.waivedByUserId).toBe(admin.id);
    });

    it("without waiveCharge still consumes the session and leaves waivedByUserId null", async () => {
      const { admin, pack, booking } = await seedLateBackedBooking();
      asAdmin(admin);

      const res = await POST(buildRequest({ bookingIds: [booking.id] }));
      expect(res.status).toBe(200);

      const after = await prisma.clientPackage.findUnique({ where: { id: pack.id } });
      expect(after?.sessionsRemaining).toBe(7); // charged

      const stamped = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(stamped?.waivedByUserId).toBeNull();
    });

    it("does not stamp waivedByUserId on an early (pre-cutoff) cancel even with waiveCharge", async () => {
      const { admin, trainer, clientProfile, reformer } = await seedBasics();
      // Session 7 days out, lateCancelHours 8 → well before cutoff (no forfeit to waive).
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + 7 * 24 * 60 * 60 * 1000),
      });
      const packageType = await prisma.packageType.create({
        data: {
          name: "Reformer 12-pack",
          sessionCount: 12,
          validityDays: 30,
          lateCancelHours: 8,
          classTypeId: reformer.id,
        },
      });
      const pack = await prisma.clientPackage.create({
        data: {
          clientProfileId: clientProfile.id,
          packageTypeId: packageType.id,
          classTypeId: reformer.id,
          lateCancelHours: 8,
          startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
          expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
          sessionsRemaining: 8,
        },
      });
      const booking = await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: clientProfile.id,
          clientPackageId: pack.id,
          createdByUserId: admin.id,
        },
      });
      asAdmin(admin);

      const res = await POST(
        buildRequest({ bookingIds: [booking.id], waiveCharge: true }),
      );
      expect(res.status).toBe(200);

      const after = await prisma.clientPackage.findUnique({ where: { id: pack.id } });
      expect(after?.sessionsRemaining).toBe(8); // early cancel never charged anyway
      const stamped = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(stamped?.waivedByUserId).toBeNull(); // nothing was waived
    });

    it("does not stamp waivedByUserId on an unbacked admin reservation even with waiveCharge", async () => {
      const { admin, trainer, clientProfile, reformer } = await seedBasics();
      // Late session but no clientPackageId → nothing to forfeit, nothing to waive.
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + 60 * 60 * 1000),
      });
      const booking = await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: clientProfile.id,
          createdByUserId: admin.id,
        },
      });
      asAdmin(admin);

      const res = await POST(
        buildRequest({ bookingIds: [booking.id], waiveCharge: true }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.canceled).toBe(1);

      const stamped = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(stamped?.waivedByUserId).toBeNull();
    });
  });
});

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

import { POST } from "@/app/api/admin/reservations/+api";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

async function seedBasics() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
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
  return { admin, trainer, clientUser, clientProfile, reformer };
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
  return new Request("http://test.local/api/admin/reservations", {
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

describe("POST /api/admin/reservations", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("creates an unbacked Booking for a session even when client has no package", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [session.id],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(1);
    expect(body.skippedFull).toEqual([]);
    expect(body.skippedAlreadyBooked).toEqual([]);

    const booking = await prisma.booking.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(booking).not.toBeNull();
    expect(booking?.clientPackageId).toBeNull();
    expect(booking?.createdByUserId).toBe(admin.id);
    expect(booking?.canceledAt).toBeNull();
  });

  it("skips full sessions and reports them in skippedFull", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    // Capacity 1, already filled.
    const fullSession = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
      capacity: 1,
    });
    const otherClient = await prisma.user.create({
      data: { email: "other@test.local", firstName: "Other", lastName: "Client", role: "CLIENT" },
    });
    const otherProfile = await prisma.clientProfile.create({
      data: { userId: otherClient.id },
    });
    await prisma.booking.create({
      data: { sessionId: fullSession.id, clientProfileId: otherProfile.id },
    });
    const openSession = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 48 * 60 * 60 * 1000),
    });
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [fullSession.id, openSession.id],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(1);
    expect(body.skippedFull).toEqual([fullSession.id]);

    const bookingForFull = await prisma.booking.findFirst({
      where: { sessionId: fullSession.id, clientProfileId: clientProfile.id },
    });
    expect(bookingForFull).toBeNull();
    const bookingForOpen = await prisma.booking.findFirst({
      where: { sessionId: openSession.id, clientProfileId: clientProfile.id },
    });
    expect(bookingForOpen).not.toBeNull();
  });

  it("skips sessions the client is already booked on", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [session.id],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(0);
    expect(body.skippedAlreadyBooked).toEqual([session.id]);
  });

  it("forbids non-admin callers (403)", async () => {
    const { trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });
    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [session.id],
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects empty sessionIds with 400", async () => {
    const { admin, clientProfile } = await seedBasics();
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-string clientProfileId with 400 and Zod details", async () => {
    const { admin } = await seedBasics();
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: 123,
        sessionIds: ["some-session-id"],
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details?: unknown };
    expect(body.details).toBeDefined();
  });
});

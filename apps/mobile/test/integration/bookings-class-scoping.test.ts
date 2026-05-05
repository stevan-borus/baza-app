/**
 * Integration tests for POST /api/bookings — class-scoping enforcement at booking time.
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

// Notifications fire-and-forget — no need to actually push during tests.
vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/bookings/+api";
import { prisma } from "@/lib/server/prisma";

async function seed() {
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
  const energy = await prisma.classType.create({
    data: { name: "Energy pilates", maxClients: 12, durationMins: 60 },
  });
  return { trainer, client, clientProfile, reformer, energy };
}

async function createSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAt: Date;
  capacity?: number;
}) {
  const session = await prisma.session.create({
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
  return session;
}

async function createPackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  sessionsRemaining?: number;
  startsAt?: Date;
  expiresAt?: Date;
}) {
  // Ensure a parent PackageType exists.
  const packageType = await prisma.packageType.create({
    data: {
      name: `pt-${Math.random()}`,
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: opts.classTypeId,
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypeId: opts.classTypeId,
      lateCancelHours: 12,
      startsAt: opts.startsAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
      expiresAt:
        opts.expiresAt ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      sessionsRemaining: opts.sessionsRemaining ?? 12,
    },
  });
}

function buildJsonRequest(body: unknown) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bookings class-scoping", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns 409 with no_package_for_class when client has only an other-class pack", async () => {
    const { client, clientProfile, trainer, reformer, energy } = await seed();
    // Client owns only an Energy pack — they're booking a Reformer session.
    await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: energy.id,
    });
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await POST(
      buildJsonRequest({ sessionId: session.id, action: "BOOK" }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("no_package_for_class");
  });

  it("books successfully when client owns a pack for the session's class", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    const pkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
    });
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await POST(
      buildJsonRequest({ sessionId: session.id, action: "BOOK" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("BOOKED");
    const booking = await prisma.booking.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(booking?.clientPackageId).toBe(pkg.id);
  });
});

/**
 * GET /api/sessions/availability — `isBookedByMe` and `lateCancelHours`
 * fields. Both were silently `undefined` for a while because the local
 * Zod schema in `sessions-queries-factory.ts` stripped them on the way to
 * the UI; that's covered separately by a unit test on the factory if/when
 * we add one. Here we verify the SERVER actually returns them.
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

import { GET } from "@/app/api/sessions/availability/+api";
import { prisma } from "@/lib/server/prisma";

const MONTH = "2026-06";

function buildRequest() {
  return new Request(
    `http://test.local/api/sessions/availability?month=${encodeURIComponent(MONTH)}`,
  );
}

type SessionRow = {
  id: string;
  isBookedByMe?: boolean;
  lateCancelHours?: number | null;
};

async function fixtures() {
  const trainer = await prisma.user.create({
    data: { email: "av-tr@t.local", firstName: "T", lastName: "Trainer", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "av-c@t.local", firstName: "C", lastName: "Client", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala", capacity: 6 },
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
      startsAt: new Date("2026-05-01"),
      expiresAt: new Date("2026-12-01"),
      sessionsRemaining: 12,
    },
  });
  return { trainer, client, clientProfile, room, reformer, pkg };
}

async function makeSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  roomId: string;
  startsAt: Date;
}) {
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      roomId: opts.roomId,
      startsAt: opts.startsAt,
      endsAt: new Date(opts.startsAt.getTime() + 60 * 60 * 1000),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

describe("GET /api/sessions/availability — isBookedByMe / lateCancelHours", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("marks the session as isBookedByMe=true for the booking client", async () => {
    const { trainer, client, clientProfile, room, reformer, pkg } = await fixtures();
    const session = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date("2026-06-10T10:00:00Z"),
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

    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: SessionRow[] };
    const row = body.sessions.find((s) => s.id === session.id)!;
    expect(row.isBookedByMe).toBe(true);
    expect(row.lateCancelHours).toBe(8);
  });

  it("returns isBookedByMe=false for unbooked sessions", async () => {
    const { trainer, client, clientProfile, room, reformer } = await fixtures();
    const session = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date("2026-06-10T10:00:00Z"),
    });
    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });
    const res = await GET(buildRequest());
    const body = (await res.json()) as { sessions: SessionRow[] };
    const row = body.sessions.find((s) => s.id === session.id)!;
    expect(row.isBookedByMe).toBe(false);
    expect(row.lateCancelHours).toBeNull();
  });

  it("canceled bookings do not count — isBookedByMe stays false", async () => {
    const { trainer, client, clientProfile, room, reformer, pkg } = await fixtures();
    const session = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date("2026-06-10T10:00:00Z"),
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pkg.id,
        canceledAt: new Date("2026-06-09T10:00:00Z"),
      },
    });
    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });
    const res = await GET(buildRequest());
    const body = (await res.json()) as { sessions: SessionRow[] };
    const row = body.sessions.find((s) => s.id === session.id)!;
    expect(row.isBookedByMe).toBe(false);
    expect(row.lateCancelHours).toBeNull();
  });
});

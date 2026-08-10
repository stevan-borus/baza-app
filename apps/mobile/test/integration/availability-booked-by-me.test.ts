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

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/sessions/availability";
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
  isWaitlistedByMe?: boolean;
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
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: clientProfile.id,
      packageTypeId: packageType.id,
      classTypes: { create: { classTypeId: reformer.id } },
      lateCancelHours: 8,
      startsAt: new Date("2026-05-01"),
      expiresAt: new Date("2026-12-01"),
      sessionsRemaining: 12,
      sessionsGranted: 12,
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

  it("marks isWaitlistedByMe=true for the session the client waits on, false elsewhere", async () => {
    const { trainer, client, clientProfile, room, reformer } = await fixtures();
    const waited = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date("2026-06-10T10:00:00Z"),
    });
    const other = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date("2026-06-11T10:00:00Z"),
    });
    await prisma.waitlistEntry.create({
      data: { sessionId: waited.id, clientProfileId: clientProfile.id, position: 1 },
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
    expect(body.sessions.find((s) => s.id === waited.id)!.isWaitlistedByMe).toBe(true);
    expect(body.sessions.find((s) => s.id === other.id)!.isWaitlistedByMe).toBe(false);
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

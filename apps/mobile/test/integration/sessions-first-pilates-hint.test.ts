/**
 * GET /api/sessions/[id] — `consentFlags.showFirstPilatesHint`.
 *
 * The hint should only surface for clients in their first ~3 sessions at
 * the studio. Anything beyond that becomes noise — the trainer already
 * knows them. The cutoff lives in `app/api/sessions/[id]/+api.ts`
 * (`PRIOR_SESSIONS_CUTOFF = 3`).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/app/api/sessions/[id]/+api";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function fixtures() {
  const admin = await prisma.user.create({
    data: { email: "adm-fpe@t.local", firstName: "A", lastName: "Test", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "tr-fpe@t.local", firstName: "T", lastName: "Test", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala", capacity: 6 },
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
  const client = await prisma.user.create({
    data: { email: "cl-fpe@t.local", firstName: "Klijent", lastName: "Test", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
  });
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: clientProfile.id,
      packageTypeId: packageType.id,
      classTypeId: reformer.id,
      lateCancelHours: 8,
      startsAt: new Date(now().getTime() - 30 * DAY_MS),
      expiresAt: new Date(now().getTime() + 90 * DAY_MS),
      sessionsRemaining: 12,
    },
  });
  // Intake says "first time" (pilatesExperience contains "none") — without
  // it the hint can never fire.
  await prisma.clientHealthIntake.create({
    data: {
      clientProfileId: clientProfile.id,
      conditions: [],
      underMedicalTreatment: false,
      pilatesExperience: ["none"],
      activityLevel: "moderate",
      exerciseFrequency: "2-3",
      goals: [],
      discomfortDuring: [],
    },
  });
  return { admin, trainer, reformer, room, clientProfile, pkg };
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
      endsAt: new Date(opts.startsAt.getTime() + HOUR_MS),
      capacity: 6,
      status: "SCHEDULED",
    },
  });
}

async function seedPriorBookings(opts: {
  clientProfileId: string;
  packageId: string;
  classTypeId: string;
  trainerUserId: string;
  roomId: string;
  count: number;
}) {
  for (let i = 1; i <= opts.count; i++) {
    const startsAt = new Date(now().getTime() - i * DAY_MS);
    const session = await prisma.session.create({
      data: {
        classTypeId: opts.classTypeId,
        trainerUserId: opts.trainerUserId,
        roomId: opts.roomId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HOUR_MS),
        capacity: 6,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: opts.clientProfileId,
        clientPackageId: opts.packageId,
      },
    });
  }
}

function getReq(id: string) {
  return new Request(`http://test.local/api/sessions/${id}`);
}

describe("GET /api/sessions/[id] — showFirstPilatesHint cutoff", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns showFirstPilatesHint=true for the client's first booking", async () => {
    const { admin, trainer, reformer, room, clientProfile, pkg } = await fixtures();
    const session = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date(now().getTime() + DAY_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(getReq(session.id), { id: session.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: {
        bookings: Array<{ consentFlags: { showFirstPilatesHint: boolean } }>;
      };
    };
    expect(body.session.bookings[0]?.consentFlags.showFirstPilatesHint).toBe(true);
  });

  it("stays true when the client has 2 prior sessions (still inside cutoff)", async () => {
    const { admin, trainer, reformer, room, clientProfile, pkg } = await fixtures();
    await seedPriorBookings({
      clientProfileId: clientProfile.id,
      packageId: pkg.id,
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      count: 2,
    });
    const session = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date(now().getTime() + DAY_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });
    const res = await GET(getReq(session.id), { id: session.id });
    const body = (await res.json()) as {
      session: {
        bookings: Array<{ consentFlags: { showFirstPilatesHint: boolean } }>;
      };
    };
    expect(body.session.bookings[0]?.consentFlags.showFirstPilatesHint).toBe(true);
  });

  it("flips to false once the client has 3+ prior sessions", async () => {
    const { admin, trainer, reformer, room, clientProfile, pkg } = await fixtures();
    await seedPriorBookings({
      clientProfileId: clientProfile.id,
      packageId: pkg.id,
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      count: 3,
    });
    const session = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date(now().getTime() + DAY_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });
    const res = await GET(getReq(session.id), { id: session.id });
    const body = (await res.json()) as {
      session: {
        bookings: Array<{ consentFlags: { showFirstPilatesHint: boolean } }>;
      };
    };
    expect(body.session.bookings[0]?.consentFlags.showFirstPilatesHint).toBe(false);
  });

  it("is false when no intake exists (no first-time signal)", async () => {
    const admin = await prisma.user.create({
      data: { email: "adm2-fpe@t.local", firstName: "A", lastName: "Test", role: "ADMIN" },
    });
    const trainer = await prisma.user.create({
      data: { email: "tr2-fpe@t.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    });
    const reformer = await prisma.classType.create({
      data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
    });
    const room = await prisma.studioRoom.create({
      data: { name: "Sala", capacity: 6 },
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
    const client = await prisma.user.create({
      data: { email: "cl2-fpe@t.local", firstName: "K", lastName: "Test", role: "CLIENT" },
    });
    const clientProfile = await prisma.clientProfile.create({
      data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
    });
    const pkg = await prisma.clientPackage.create({
      data: {
        clientProfileId: clientProfile.id,
        packageTypeId: packageType.id,
        classTypeId: reformer.id,
        lateCancelHours: 8,
        startsAt: new Date(now().getTime() - DAY_MS),
        expiresAt: new Date(now().getTime() + 90 * DAY_MS),
        sessionsRemaining: 12,
      },
    });
    const session = await makeSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date(now().getTime() + DAY_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });
    const res = await GET(getReq(session.id), { id: session.id });
    const body = (await res.json()) as {
      session: {
        bookings: Array<{ consentFlags: { showFirstPilatesHint: boolean } }>;
      };
    };
    expect(body.session.bookings[0]?.consentFlags.showFirstPilatesHint).toBe(false);
  });
});

/**
 * Per-session renewal flags on GET /api/sessions/availability:
 * - `bookable`  — false when the client owns a pack for the class but none is
 *                 eligible (expired / used up / paused / not started).
 * - `lastBookableSlot` — true when confirming a booking would take the LAST
 *                 free slot on the eligible package (remaining − holds === 1).
 *
 * Anchor: env.setup.ts pins TEST_ANCHOR_TIME to 2026-05-09T10:00:00Z, so all
 * 2026-06 sessions below are in the future and count as holds.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/sessions/availability";
import { prisma } from "@/lib/server/prisma";

async function baseFixtures() {
  const trainer = await prisma.user.create({
    data: { email: "tr@test.local", firstName: "T", lastName: "Trainer", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
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

async function makeSession(classTypeId: string, trainerUserId: string, startsAt: Date) {
  return prisma.session.create({
    data: {
      classTypeId,
      trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function makePackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  sessionsRemaining?: number;
  startsAt?: Date;
  expiresAt?: Date;
}) {
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
      startsAt: opts.startsAt ?? new Date("2026-05-01T00:00:00Z"),
      expiresAt: opts.expiresAt ?? new Date("2026-12-01T00:00:00Z"),
      sessionsRemaining: opts.sessionsRemaining ?? 12,
    },
  });
}

function buildRequest(month: string) {
  return new Request(
    `http://test.local/api/sessions/availability?month=${encodeURIComponent(month)}`,
  );
}

function asClient(user: { id: string; email: string }, clientProfileId: string) {
  setMockUser({
    id: user.id,
    role: "CLIENT",
    email: user.email,
    isActive: true,
    clientProfile: { id: clientProfileId },
  });
}

const MONTH = "2026-06";
const SESSION_DATE = new Date("2026-06-15T10:00:00Z");
const OTHER_SESSION_DATE = new Date("2026-06-17T10:00:00Z");

describe("GET /api/sessions/availability renewal flags", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("marks sessions bookable with no last-slot warning while plenty of sessions remain", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const session = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 12,
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      id: session.id,
      bookable: true,
      lastBookableSlot: false,
    });
  });

  it("flags lastBookableSlot when exactly one session remains and nothing is held", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 1,
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      bookable: true,
      lastBookableSlot: true,
    });
  });

  it("counts an existing future booking as a hold when computing the last slot", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const bookedSession = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    const openSession = await makeSession(
      reformer.id,
      trainer.id,
      OTHER_SESSION_DATE,
    );
    const pkg = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 2,
    });
    await prisma.booking.create({
      data: {
        sessionId: bookedSession.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const open = json.sessions.find((s: { id: string }) => s.id === openSession.id);
    // 2 remaining − 1 held booking = 1 free slot → the next booking is the last.
    expect(open).toMatchObject({ bookable: true, lastBookableSlot: true });
  });

  it("counts a waitlist entry on a same-class future session as a hold", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const waitlistedSession = await makeSession(
      reformer.id,
      trainer.id,
      SESSION_DATE,
    );
    const openSession = await makeSession(
      reformer.id,
      trainer.id,
      OTHER_SESSION_DATE,
    );
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 2,
    });
    await prisma.waitlistEntry.create({
      data: {
        sessionId: waitlistedSession.id,
        clientProfileId: clientProfile.id,
        position: 1,
      },
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const open = json.sessions.find((s: { id: string }) => s.id === openSession.id);
    expect(open).toMatchObject({ bookable: true, lastBookableSlot: true });
  });

  it("mixes greyed-out and bookable sessions per class type for the same client", async () => {
    const { client, clientProfile, trainer, reformer, energy } =
      await baseFixtures();
    const reformerSession = await makeSession(
      reformer.id,
      trainer.id,
      SESSION_DATE,
    );
    const energySession = await makeSession(
      energy.id,
      trainer.id,
      OTHER_SESSION_DATE,
    );
    // Reformer pack is used up → owned but not eligible → greyed out.
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 0,
    });
    // Energy pack is alive → bookable.
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: energy.id,
      sessionsRemaining: 8,
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(2);
    const reformerOut = json.sessions.find(
      (s: { id: string }) => s.id === reformerSession.id,
    );
    const energyOut = json.sessions.find(
      (s: { id: string }) => s.id === energySession.id,
    );
    expect(reformerOut).toMatchObject({ bookable: false, lastBookableSlot: false });
    expect(energyOut).toMatchObject({ bookable: true, lastBookableSlot: false });
  });

  it("keeps trainer sessions always bookable with no warnings", async () => {
    const { trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);

    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      bookable: true,
      lastBookableSlot: false,
    });
  });
});

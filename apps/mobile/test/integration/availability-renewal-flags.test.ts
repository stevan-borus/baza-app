/**
 * Per-session renewal flags on GET /api/sessions/availability:
 * - `bookable`  — false when the client owns a pack for the class but can't
 *                 book: no eligible package (expired / used up / paused /
 *                 not started), or the eligible package is fully held.
 * - `lockReason` — why bookable is false: "RENEW" (no eligible package) or
 *                 "FULLY_HELD" (remaining − holds === 0: every remaining
 *                 session is already committed to future bookings/waitlist).
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

async function makePause(opts: {
  clientProfileId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  return prisma.packagePause.create({
    data: {
      clientProfileId: opts.clientProfileId,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
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

  it("locks sessions as FULLY_HELD when every remaining session is already held", async () => {
    // The pilot incident shape: the package still has sessions remaining, but
    // ALL of them are committed to future holds — the rows must stop looking
    // bookable (the book call would 409) and carry a reason the UI can show.
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
      sessionsRemaining: 1,
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
    // 1 remaining − 1 held booking = 0 free slots → locked, NOT a renewal case.
    const open = json.sessions.find((s: { id: string }) => s.id === openSession.id);
    expect(open).toMatchObject({
      bookable: false,
      lockReason: "FULLY_HELD",
      lastBookableSlot: false,
    });
    // The session holding the booking reports the same lock, but stays marked
    // as the client's own booking (the UI renders it as booked, not greyed).
    const booked = json.sessions.find(
      (s: { id: string }) => s.id === bookedSession.id,
    );
    expect(booked).toMatchObject({
      bookable: false,
      lockReason: "FULLY_HELD",
      isBookedByMe: true,
    });
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
    // Owned-but-ineligible (used up) is the renewal case, not FULLY_HELD.
    expect(reformerOut).toMatchObject({
      bookable: false,
      lockReason: "RENEW",
      lastBookableSlot: false,
    });
    expect(energyOut).toMatchObject({ bookable: true, lastBookableSlot: false });
    // Bookable sessions carry no lock reason at all.
    expect(energyOut.lockReason).toBeUndefined();
  });

  it("locks sessions as PAUSED when the client owns a live pack but is inside an active pause window", async () => {
    // The client paused on purpose — the pack is otherwise fully bookable
    // (started, has sessions, unexpired). Saying "renew" here would be wrong;
    // the row must read PAUSED so the sheet can explain the pause.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const session = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 8,
    });
    // Anchor is 2026-05-09T10:00:00Z — this window is active "now".
    await makePause({
      clientProfileId: clientProfile.id,
      startsAt: new Date("2026-05-01T00:00:00Z"),
      endsAt: new Date("2026-06-30T00:00:00Z"),
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      id: session.id,
      bookable: false,
      lockReason: "PAUSED",
      lastBookableSlot: false,
    });
  });

  it("locks sessions as NOT_STARTED for sessions before the pack's window opens", async () => {
    // The pack is funded and has sessions, but its startsAt is AFTER this
    // session — the session falls before the pack's window opens, so there is
    // no eligible pack to spend at the session date. Booking opens once the
    // pack's window begins; this is a NOT_STARTED lock, not a renewal.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    // SESSION_DATE is 2026-06-15; pack opens 2026-06-20 → session precedes it.
    const session = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 10,
      startsAt: new Date("2026-06-20T00:00:00Z"),
      expiresAt: new Date("2026-09-01T00:00:00Z"),
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      id: session.id,
      bookable: false,
      lockReason: "NOT_STARTED",
      lastBookableSlot: false,
    });
  });

  it("keeps a session INSIDE a future pack's window bookable (pre-booking a funded window is allowed)", async () => {
    // Companion to the NOT_STARTED case, pinning the intended positive
    // semantic: eligibility is evaluated at the session's date, not at "now".
    // A pack that starts in the future is still eligible for sessions that fall
    // WITHIN its window — the client may pre-book a funded window. Both the
    // availability route and the booking gate agree on this; this case guards
    // against a future "fix" that locks these rows backwards.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    // SESSION_DATE is 2026-06-15; pack window is 2026-06-01 → 2026-09-01, so the
    // session falls inside the funded window even though the pack hasn't started
    // relative to the 2026-05-09 anchor.
    const session = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 10,
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-09-01T00:00:00Z"),
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
    expect(json.sessions[0].lockReason).toBeUndefined();
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

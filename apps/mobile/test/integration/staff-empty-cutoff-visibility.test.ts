/**
 * Staff-facing visibility of the empty-session cutoff.
 *
 * The cutoff exists so a trainer can plan around a slot nobody booked — but
 * staff payloads deliberately carry no booking flags (staff bypass the rule),
 * so until now the calendar showed an ordinary empty 0/6 card with no hint
 * that clients can no longer sign up. `emptyCutoffLocked` is the display-only
 * signal for exactly that: true when the session is empty AND inside its
 * session's cutoff window, on every role's payload.
 *
 * Anchor: env.setup.ts pins TEST_ANCHOR_TIME to 2026-05-09T10:00:00Z, so the
 * hour offsets below all land in month 2026-05.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as availabilityGET } from "@/server/routes/sessions/availability";
import { GET as sessionDetailGET } from "@/server/routes/sessions/[id]";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MONTH = "2026-05";

async function baseFixtures() {
  const trainer = await prisma.user.create({
    data: { email: "tr@test.local", firstName: "T", lastName: "Trainer", role: "TRAINER" },
  });
  const admin = await prisma.user.create({
    data: { email: "ad@test.local", firstName: "A", lastName: "Admin", role: "ADMIN" },
  });
  const client = await prisma.user.create({
    data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id },
  });
  const reformer = await prisma.classType.create({
    data: {
      name: "Reformer pilates",
      maxClients: 6,
      durationMins: 60,
    },
  });
  return { trainer, admin, client, clientProfile, reformer };
}

async function makeSession(
  classTypeId: string,
  trainerUserId: string,
  startsAt: Date,
  emptyBookingCutoffHours?: number,
) {
  return prisma.session.create({
    data: {
      classTypeId,
      trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
      ...(emptyBookingCutoffHours === undefined
        ? {}
        : { emptyBookingCutoffHours }),
    },
  });
}

async function makePackage(opts: { clientProfileId: string; classTypeId: string }) {
  const packageType = await prisma.packageType.create({
    data: {
      name: `pt-${Math.random()}`,
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: opts.classTypeId } },
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypes: { create: { classTypeId: opts.classTypeId } },
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - 30 * DAY_MS),
      expiresAt: new Date(nowMs() + 90 * DAY_MS),
      sessionsRemaining: 12,
      sessionsGranted: 12,
    },
  });
}

/** Books `clientProfileId` onto `sessionId` so the session is no longer empty. */
async function bookOnto(sessionId: string, classTypeId: string) {
  const user = await prisma.user.create({
    data: { email: `b-${Math.random()}@test.local`, firstName: "B", lastName: "Booked", role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({ data: { userId: user.id } });
  const pkg = await makePackage({ clientProfileId: profile.id, classTypeId });
  await prisma.booking.create({
    data: { sessionId, clientProfileId: profile.id, clientPackageId: pkg.id },
  });
}

function availabilityRequest(month: string) {
  return new Request(
    `http://test.local/api/sessions/availability?month=${encodeURIComponent(month)}`,
  );
}

function asAdmin(user: { id: string; email: string }) {
  setMockUser({
    id: user.id,
    role: "ADMIN",
    email: user.email,
    isActive: true,
    clientProfile: null,
  });
}

function asTrainer(user: { id: string; email: string }) {
  setMockUser({
    id: user.id,
    role: "TRAINER",
    email: user.email,
    isActive: true,
    clientProfile: null,
  });
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

describe("empty-cutoff visibility on GET /api/sessions/availability", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("flags an empty session inside the window for an admin", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + 2 * HOUR_MS),
    );

    asAdmin(admin);

    const res = await availabilityGET(availabilityRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      id: session.id,
      emptyCutoffLocked: true,
      // Staff stay bookable — the flag is informational, never a gate.
      bookable: true,
    });
    expect(json.sessions[0].lockReason).toBeUndefined();
  });

  it("flags the same session for the assigned trainer", async () => {
    const { trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, new Date(nowMs() + 2 * HOUR_MS));

    asTrainer(trainer);

    const res = await availabilityGET(availabilityRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({ emptyCutoffLocked: true, bookable: true });
  });

  it("does not flag an empty session outside the window", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, new Date(nowMs() + 5 * HOUR_MS));

    asAdmin(admin);

    const res = await availabilityGET(availabilityRequest(MONTH));
    const json = await res.json();
    expect(json.sessions[0].emptyCutoffLocked).toBeFalsy();
  });

  it("does not flag a session inside the window that has a booking", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + 2 * HOUR_MS),
    );
    await bookOnto(session.id, reformer.id);

    asAdmin(admin);

    const res = await availabilityGET(availabilityRequest(MONTH));
    const json = await res.json();
    expect(json.sessions[0].emptyCutoffLocked).toBeFalsy();
  });

  it("does not flag when the session's cutoff is 0", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, new Date(nowMs() + HOUR_MS), 0);

    asAdmin(admin);

    const res = await availabilityGET(availabilityRequest(MONTH));
    const json = await res.json();
    expect(json.sessions[0].emptyCutoffLocked).toBeFalsy();
  });

  it("carries the flag on the client payload alongside the booking lock", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, new Date(nowMs() + 2 * HOUR_MS));
    await makePackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id });

    asClient(client, clientProfile.id);

    const res = await availabilityGET(availabilityRequest(MONTH));
    const json = await res.json();
    expect(json.sessions[0]).toMatchObject({
      emptyCutoffLocked: true,
      bookable: false,
      lockReason: "EMPTY_CUTOFF",
    });
  });
});

describe("empty-cutoff visibility on GET /api/sessions/[id]", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("reports the lock and its window on an empty session inside the cutoff", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + 2 * HOUR_MS),
    );

    asAdmin(admin);

    const res = await sessionDetailGET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const json = await res.json();
    expect(json.session).toMatchObject({
      emptyCutoffLocked: true,
      emptyBookingCutoffHours: 4,
    });
  });

  it("reports the flag to the assigned trainer too", async () => {
    const { trainer, reformer } = await baseFixtures();
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + 2 * HOUR_MS),
    );

    asTrainer(trainer);

    const res = await sessionDetailGET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const json = await res.json();
    expect(json.session.emptyCutoffLocked).toBe(true);
  });

  it("does not flag a session outside the window", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + 5 * HOUR_MS),
    );

    asAdmin(admin);

    const res = await sessionDetailGET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const json = await res.json();
    expect(json.session.emptyCutoffLocked).toBeFalsy();
  });

  it("does not flag a session inside the window once someone has booked", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + 2 * HOUR_MS),
    );
    await bookOnto(session.id, reformer.id);

    asAdmin(admin);

    const res = await sessionDetailGET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const json = await res.json();
    expect(json.session.emptyCutoffLocked).toBeFalsy();
  });

  it("does not flag when the session's cutoff is 0", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + HOUR_MS),
      0,
    );

    asAdmin(admin);

    const res = await sessionDetailGET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const json = await res.json();
    expect(json.session.emptyCutoffLocked).toBeFalsy();
  });
});

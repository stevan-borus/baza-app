/**
 * Empty-session cutoff on GET /api/sessions/availability.
 *
 * The booking gate already 409s on a last-minute booking into a class nobody
 * has joined yet. The client calendar has to agree BEFORE the tap: a session
 * inside its own empty-booking cutoff window comes back
 * `bookable: false` with `lockReason: "EMPTY_CUTOFF"` and the hours to
 * interpolate into the sheet's explanation.
 *
 * Anchor: env.setup.ts pins TEST_ANCHOR_TIME to 2026-05-09T10:00:00Z, so the
 * hour offsets below all land in month 2026-05.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/sessions/availability";
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
      classTypes: { create: { classTypeId: opts.classTypeId } },
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypes: { create: { classTypeId: opts.classTypeId } },
      lateCancelHours: 12,
      startsAt: opts.startsAt ?? new Date(nowMs() - 30 * DAY_MS),
      expiresAt: opts.expiresAt ?? new Date(nowMs() + 90 * DAY_MS),
      sessionsRemaining: opts.sessionsRemaining ?? 12,
      sessionsGranted: opts.sessionsRemaining ?? 12,
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

describe("GET /api/sessions/availability empty-session cutoff", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("locks an empty session starting inside the cutoff window", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + 2 * HOUR_MS),
    );
    await makePackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      id: session.id,
      bookable: false,
      lockReason: "EMPTY_CUTOFF",
      emptyBookingCutoffHours: 4,
      lastBookableSlot: false,
    });
  });

  it("keeps an empty session outside the cutoff window bookable", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, new Date(nowMs() + 5 * HOUR_MS));
    await makePackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({ bookable: true });
    expect(json.sessions[0].lockReason).toBeUndefined();
  });

  it("keeps a session inside the window bookable once another client is in", async () => {
    // The room is opening regardless — the cutoff only guards the empty class.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const otherUser = await prisma.user.create({
      data: { email: "o@test.local", firstName: "O", lastName: "Other", role: "CLIENT" },
    });
    const otherProfile = await prisma.clientProfile.create({
      data: { userId: otherUser.id },
    });
    const session = await makeSession(
      reformer.id,
      trainer.id,
      new Date(nowMs() + 2 * HOUR_MS),
    );
    const otherPkg = await makePackage({
      clientProfileId: otherProfile.id,
      classTypeId: reformer.id,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: otherProfile.id,
        clientPackageId: otherPkg.id,
      },
    });
    await makePackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions[0]).toMatchObject({ bookable: true });
    expect(json.sessions[0].lockReason).toBeUndefined();
  });

  it("never locks when the session's cutoff is 0", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, new Date(nowMs() + HOUR_MS), 0);
    await makePackage({ clientProfileId: clientProfile.id, classTypeId: reformer.id });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({ bookable: true });
    expect(json.sessions[0].lockReason).toBeUndefined();
  });

  it("reports EMPTY_CUTOFF ahead of a package lock the client can act on", async () => {
    // A client with only an expired pack would normally read RENEW. Renewing
    // would not open this session for anyone, so the absolute reason wins —
    // otherwise the row sells a renewal that buys nothing.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, new Date(nowMs() + 2 * HOUR_MS));
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      startsAt: new Date(nowMs() - 90 * DAY_MS),
      expiresAt: new Date(nowMs() - 30 * DAY_MS),
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      bookable: false,
      lockReason: "EMPTY_CUTOFF",
      emptyBookingCutoffHours: 4,
    });
  });

  it("leaves staff payloads untouched for the same locked session", async () => {
    const { admin, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, new Date(nowMs() + 2 * HOUR_MS));

    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({ bookable: true });
    expect(json.sessions[0].lockReason).toBeUndefined();
    expect(json.sessions[0].emptyBookingCutoffHours).toBeUndefined();
  });
});

/**
 * Repro spec for the pilot report: "I early-cancelled a booking and the app
 * would not let me book again, and the remaining display did not update."
 *
 * Documents the actual system model:
 *  - An early cancel frees the HOLD immediately — rebooking succeeds and
 *    `sessionsRemaining` legitimately does NOT change (credits are consumed at
 *    attendance / late-cancel forfeit, never at booking time).
 *  - A WAITLIST entry silently consumes a hold (the user's chosen model: a
 *    waitlist seat also reserves a session) — the likely reason the pilot
 *    client "couldn't rebook" while the UI showed sessions as available.
 *  - GET /api/packages/client-packages (CLIENT branch) exposes `heldCount`
 *    and `bookable` so the UI can show "left to book" instead of raw credits.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/bookings";
import { GET as getClientPackages } from "@/server/routes/packages/client-packages";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seed() {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "User", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return { trainer, client, clientProfile, reformer };
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
      endsAt: new Date(opts.startsAt.getTime() + HOUR_MS),
      capacity: opts.capacity ?? 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function createPackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  sessionsRemaining: number;
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
      startsAt: new Date(nowMs() - DAY_MS),
      expiresAt: new Date(nowMs() + 60 * DAY_MS),
      sessionsRemaining: opts.sessionsRemaining,
    },
  });
}

function mutateReq(sessionId: string, action: "BOOK" | "CANCEL") {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, action }),
  });
}

function packagesReq() {
  return new Request("http://test.local/api/packages/client-packages");
}

function asClient(client: { id: string; email: string }, profileId: string) {
  setMockUser({
    id: client.id,
    role: "CLIENT",
    email: client.email,
    isActive: true,
    clientProfile: { id: profileId },
  });
}

/** Puts the client on the waitlist of a fresh session pre-filled by another client. */
async function joinWaitlistOnFullSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAt: Date;
}) {
  const full = await createSession({ ...opts, capacity: 1 });
  const fillerUser = await prisma.user.create({
    data: {
      email: `filler-${Math.random()}@test.local`,
      firstName: "Filler",
      lastName: "Client",
      role: "CLIENT",
    },
  });
  const fillerProfile = await prisma.clientProfile.create({
    data: { userId: fillerUser.id, dateOfBirth: new Date("1990-01-01") },
  });
  await prisma.booking.create({
    data: { sessionId: full.id, clientProfileId: fillerProfile.id },
  });
  const res = await POST(mutateReq(full.id, "BOOK"));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { state: string }).state).toBe("WAITLISTED");
  return full;
}

describe("early cancel frees the hold (pilot rebook bug)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("a) with all N remaining held via bookings, an early cancel lets the client book again and leaves sessionsRemaining unchanged", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    const pkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 2,
    });
    asClient(client, clientProfile.id);

    // Hold every remaining session via bookings, all far outside the 12h
    // late-cancel window (2-3 days out — the pilot report's shape).
    const s1 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * DAY_MS) });
    const s2 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 3 * DAY_MS) });
    expect((await POST(mutateReq(s1.id, "BOOK"))).status).toBe(200);
    expect((await POST(mutateReq(s2.id, "BOOK"))).status).toBe(200);

    // At the limit: one more booking is rejected.
    const s3 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 4 * DAY_MS) });
    const blocked = await POST(mutateReq(s3.id, "BOOK"));
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: string }).error).toBe("PACKAGE_EXHAUSTED");

    // EARLY cancel (48h before startsAt, window is 12h) — no forfeit.
    const cancelRes = await POST(mutateReq(s1.id, "CANCEL"));
    expect(cancelRes.status).toBe(200);
    expect(((await cancelRes.json()) as { state: string }).state).toBe("CANCELED");

    // The freed hold makes the next booking succeed…
    const rebook = await POST(mutateReq(s3.id, "BOOK"));
    expect(rebook.status).toBe(200);
    expect(((await rebook.json()) as { state: string }).state).toBe("BOOKED");

    // …and the credit count is UNTOUCHED: nothing was consumed. This is why
    // the pilot's "3 od 12" display "not updating" was correct data shown
    // with the wrong meaning — remaining is credits, not bookable.
    const pack = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(pack.sessionsRemaining).toBe(2);
    const consumption = await prisma.sessionConsumption.findFirst({
      where: { clientProfileId: clientProfile.id, sessionId: s1.id },
    });
    expect(consumption).toBeNull();
  });

  it("b) a waitlist entry eats a hold: at the limit booking is rejected; early-cancelling the booking frees one hold and booking succeeds again", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 2,
    });
    asClient(client, clientProfile.id);

    // Hold 1: a normal booking, far outside the cancel window.
    const booked = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * DAY_MS) });
    expect((await POST(mutateReq(booked.id, "BOOK"))).status).toBe(200);

    // Hold 2: a WAITLIST seat on a full session of the same class type.
    await joinWaitlistOnFullSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 3 * DAY_MS),
    });

    // At the limit WITH a waitlist entry: PACKAGE_EXHAUSTED — the waitlist
    // seat invisibly consumes a hold. This is the exact trap the pilot hit.
    const open = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 4 * DAY_MS) });
    const blocked = await POST(mutateReq(open.id, "BOOK"));
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: string }).error).toBe("PACKAGE_EXHAUSTED");

    // Early-cancel the booking → holds drop to 1 (< 2) → booking works again.
    const cancelRes = await POST(mutateReq(booked.id, "CANCEL"));
    expect(cancelRes.status).toBe(200);
    const rebook = await POST(mutateReq(open.id, "BOOK"));
    expect(rebook.status).toBe(200);
    expect(((await rebook.json()) as { state: string }).state).toBe("BOOKED");
  });

  it("c) GET /api/packages/client-packages exposes heldCount and bookable, and they move on booking/waitlist/cancel while sessionsRemaining stays put", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    const pkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 3,
    });
    asClient(client, clientProfile.id);

    type PackagesBody = {
      packages: Array<{
        id: string;
        sessionsRemaining: number;
        heldCount?: number;
        bookable?: number;
      }>;
    };
    async function readPackage() {
      const res = await getClientPackages(packagesReq());
      expect(res.status).toBe(200);
      const body = (await res.json()) as PackagesBody;
      const row = body.packages.find((p) => p.id === pkg.id);
      expect(row).toBeDefined();
      return row!;
    }

    // No holds yet: everything remaining is bookable.
    expect(await readPackage()).toMatchObject({
      sessionsRemaining: 3,
      heldCount: 0,
      bookable: 3,
    });

    // One booking + one waitlist seat → 2 held, 1 bookable, 3 remaining.
    const booked = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * DAY_MS) });
    expect((await POST(mutateReq(booked.id, "BOOK"))).status).toBe(200);
    await joinWaitlistOnFullSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 3 * DAY_MS),
    });
    expect(await readPackage()).toMatchObject({
      sessionsRemaining: 3,
      heldCount: 2,
      bookable: 1,
    });

    // Early cancel of the booking → the display number the client sees
    // (bookable) goes UP by one, while raw credits stay at 3.
    expect((await POST(mutateReq(booked.id, "CANCEL"))).status).toBe(200);
    expect(await readPackage()).toMatchObject({
      sessionsRemaining: 3,
      heldCount: 1,
      bookable: 2,
    });
  });
});

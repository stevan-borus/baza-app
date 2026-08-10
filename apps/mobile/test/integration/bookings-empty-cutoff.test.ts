import { describe, it, expect, beforeEach, vi } from "vitest";
import { setMockUser } from "./auth-mock";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST as bookingsPOST } from "@/server/routes/bookings";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";
import { resetDb } from "./setup-db";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seedClassRoomTrainer() {
  const classType = await prisma.classType.create({
    data: {
      name: "Reformer pilates",
      maxClients: 6,
      durationMins: 60,
    },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 6 },
  });
  const trainer = await prisma.user.create({
    data: {
      email: "trainer-cutoff@t.local",
      firstName: "Trainer",
      lastName: "Test",
      role: "TRAINER",
      trainerProfile: { create: {} },
    },
  });
  return { classType, room, trainer };
}

async function seedClientWithPackage(
  classTypeId: string,
  opts?: { email?: string; asCurrentUser?: boolean },
) {
  const email = opts?.email ?? "adult-cutoff@t.local";
  const adult = await prisma.user.create({
    data: {
      email,
      firstName: "Adult",
      lastName: "Client",
      role: "CLIENT",
      clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
    },
    include: { clientProfile: true },
  });
  const profileId = adult.clientProfile!.id;
  const packageType = await prisma.packageType.create({
    data: {
      name: `Reformer 10 ${email}`,
      sessionCount: 10,
      validityDays: 365,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId } },
    },
  });
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: profileId,
      packageTypeId: packageType.id,
      classTypes: { create: { classTypeId } },
      lateCancelHours: 12,
      sessionsRemaining: 10,
      startsAt: new Date(nowMs() - 90 * DAY_MS),
      expiresAt: new Date(nowMs() + 90 * DAY_MS),
    },
  });
  if (opts?.asCurrentUser !== false) {
    setMockUser({
      id: adult.id,
      role: "CLIENT",
      email: adult.email,
      isActive: true,
      clientProfile: { id: profileId },
    });
  }
  return { userId: adult.id, profileId, packageId: pkg.id };
}

async function seedSession(opts: {
  classTypeId: string;
  roomId: string;
  trainerUserId: string;
  startsAt: Date;
  emptyBookingCutoffHours?: number;
}) {
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      roomId: opts.roomId,
      trainerUserId: opts.trainerUserId,
      startsAt: opts.startsAt,
      endsAt: new Date(opts.startsAt.getTime() + HOUR_MS),
      capacity: 6,
      status: "SCHEDULED",
      ...(opts.emptyBookingCutoffHours === undefined
        ? {}
        : { emptyBookingCutoffHours: opts.emptyBookingCutoffHours }),
    },
  });
}

function makeReq(action: "BOOK" | "CANCEL", sessionId: string) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, sessionId }),
  });
}

// The studio will not open the room for a single client who books at the last
// minute: a class with nobody in it yet stops being bookable N hours before
// start (default 4, per-class-type, 0 disables). Once someone is in, the class
// is running anyway, so it stays bookable right up to start.
describe("POST /api/bookings — empty-session cutoff", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects BOOK on an empty session starting in 2h", async () => {
    const { classType, room, trainer } = await seedClassRoomTrainer();
    await seedClientWithPackage(classType.id);
    const session = await seedSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 2 * HOUR_MS),
    });

    const res = await bookingsPOST(makeReq("BOOK", session.id));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("EMPTY_SESSION_CUTOFF");
  });

  it("allows BOOK on an empty session starting in 5h", async () => {
    const { classType, room, trainer } = await seedClassRoomTrainer();
    await seedClientWithPackage(classType.id);
    const session = await seedSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 5 * HOUR_MS),
    });

    const res = await bookingsPOST(makeReq("BOOK", session.id));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("BOOKED");
  });

  it("allows BOOK 2h out when another client already holds a spot", async () => {
    const { classType, room, trainer } = await seedClassRoomTrainer();
    const other = await seedClientWithPackage(classType.id, {
      email: "other-cutoff@t.local",
      asCurrentUser: false,
    });
    await seedClientWithPackage(classType.id);
    const session = await seedSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 2 * HOUR_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: other.profileId,
        clientPackageId: other.packageId,
      },
    });

    const res = await bookingsPOST(makeReq("BOOK", session.id));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("BOOKED");
  });

  // A canceled booking never un-empties the class — the seat was given back, so
  // the studio is still opening the room for nobody.
  it("treats a session whose only booking is canceled as empty", async () => {
    const { classType, room, trainer } = await seedClassRoomTrainer();
    const other = await seedClientWithPackage(classType.id, {
      email: "other-cutoff@t.local",
      asCurrentUser: false,
    });
    await seedClientWithPackage(classType.id);
    const session = await seedSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 2 * HOUR_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: other.profileId,
        clientPackageId: other.packageId,
        canceledAt: new Date(nowMs() - HOUR_MS),
      },
    });

    const res = await bookingsPOST(makeReq("BOOK", session.id));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("EMPTY_SESSION_CUTOFF");
  });

  it("honours a per-session cutoff of 8h", async () => {
    const { classType, room, trainer } = await seedClassRoomTrainer();
    await seedClientWithPackage(classType.id);
    const session = await seedSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 5 * HOUR_MS),
      emptyBookingCutoffHours: 8,
    });

    const res = await bookingsPOST(makeReq("BOOK", session.id));

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("EMPTY_SESSION_CUTOFF");
  });

  it("disables the rule entirely when the cutoff is 0", async () => {
    const { classType, room, trainer } = await seedClassRoomTrainer();
    await seedClientWithPackage(classType.id);
    const session = await seedSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + HOUR_MS),
      emptyBookingCutoffHours: 0,
    });

    const res = await bookingsPOST(makeReq("BOOK", session.id));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("BOOKED");
  });

  // The exact edge the rule turns on: at N hours out booking is still open, and
  // only inside that window does it close.
  it("still allows BOOK on an empty session starting in exactly 4h", async () => {
    const { classType, room, trainer } = await seedClassRoomTrainer();
    await seedClientWithPackage(classType.id);
    const session = await seedSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 4 * HOUR_MS),
    });

    const res = await bookingsPOST(makeReq("BOOK", session.id));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("BOOKED");
  });
});

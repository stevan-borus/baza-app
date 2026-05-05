import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./setup-db";

import { POST } from "@/app/api/cron/sessions/consumption/+api";
import { prisma } from "@/lib/server/prisma";

const TEST_BOOTSTRAP_TOKEN = "test-bootstrap-token";

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
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12-pack",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  const clientPackage = await prisma.clientPackage.create({
    data: {
      clientProfileId: clientProfile.id,
      packageTypeId: packageType.id,
      classTypeId: reformer.id,
      lateCancelHours: 12,
      startsAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      sessionsRemaining: 8,
    },
  });
  return { trainer, clientProfile, reformer, clientPackage };
}

async function createPastSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  endedHoursAgo: number;
}) {
  const endsAt = new Date(Date.now() - opts.endedHoursAgo * 60 * 60 * 1000);
  const startsAt = new Date(endsAt.getTime() - 60 * 60 * 1000);
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      startsAt,
      endsAt,
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

function buildCronRequest(token: string | null) {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (token !== null) (headers as Record<string, string>)["x-cron-token"] = token;
  return new Request(
    "http://test.local/api/cron/sessions/consumption?mode=immediate",
    { method: "POST", headers },
  );
}

describe("POST /api/cron/sessions/consumption", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns 401 when the x-cron-token header is missing", async () => {
    const response = await POST(buildCronRequest(null));
    expect(response.status).toBe(401);
  });

  it("decrements sessionsRemaining for active bookings on past-ended sessions", async () => {
    const { trainer, clientProfile, reformer, clientPackage } = await seed();
    const session = await createPastSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      endedHoursAgo: 2,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: clientPackage.id,
      },
    });

    const response = await POST(buildCronRequest(TEST_BOOTSTRAP_TOKEN));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { consumed: number };
    expect(body.consumed).toBe(1);

    const updatedPack = await prisma.clientPackage.findUnique({
      where: { id: clientPackage.id },
    });
    expect(updatedPack?.sessionsRemaining).toBe(7);

    const consumption = await prisma.sessionConsumption.findUnique({
      where: {
        clientProfileId_sessionId: {
          clientProfileId: clientProfile.id,
          sessionId: session.id,
        },
      },
    });
    expect(consumption).not.toBeNull();
  });

  it("does not consume bookings that were canceled before the late-cancel cutoff", async () => {
    const { trainer, clientProfile, reformer, clientPackage } = await seed();
    const session = await createPastSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      endedHoursAgo: 1,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: clientPackage.id,
        // Canceled 24h before session start — outside the 12h late-cancel window.
        canceledAt: new Date(session.startsAt.getTime() - 24 * 60 * 60 * 1000),
      },
    });

    const response = await POST(buildCronRequest(TEST_BOOTSTRAP_TOKEN));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { consumed: number };
    expect(body.consumed).toBe(0);

    const updatedPack = await prisma.clientPackage.findUnique({
      where: { id: clientPackage.id },
    });
    expect(updatedPack?.sessionsRemaining).toBe(8);

    const consumption = await prisma.sessionConsumption.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(consumption).toBeNull();
  });

  it("does not double-consume when a late-cancel already recorded a SessionConsumption", async () => {
    const { trainer, clientProfile, reformer, clientPackage } = await seed();
    const session = await createPastSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      endedHoursAgo: 1,
    });
    // Late-cancel path: booking canceled inside the 12h window AND the
    // booking handler already wrote a SessionConsumption + decremented the pack.
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: clientPackage.id,
        canceledAt: new Date(session.startsAt.getTime() - 30 * 60 * 1000),
      },
    });
    await prisma.sessionConsumption.create({
      data: { clientProfileId: clientProfile.id, sessionId: session.id },
    });
    await prisma.clientPackage.update({
      where: { id: clientPackage.id },
      data: { sessionsRemaining: { decrement: 1 } },
    });

    const response = await POST(buildCronRequest(TEST_BOOTSTRAP_TOKEN));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { consumed: number };
    expect(body.consumed).toBe(0);

    // Pack is still at 7 (decremented once at cancel, NOT again by cron).
    const updatedPack = await prisma.clientPackage.findUnique({
      where: { id: clientPackage.id },
    });
    expect(updatedPack?.sessionsRemaining).toBe(7);
  });
});

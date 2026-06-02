import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/cron-auth", () => ({
  requireCronAuth: (_req: Request) => ({ ok: true as const }),
}));

type NotifyArgs = [
  userId: string,
  messageKey: string,
  type: string,
  payload: Record<string, unknown>,
  options?: { dedupeKey?: string; skipPush?: boolean },
];
const createSystemNotificationMock = vi.fn(async (..._args: NotifyArgs) => {
  return undefined as unknown;
});
vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: (...args: NotifyArgs) =>
    createSystemNotificationMock(...args),
}));

import { POST } from "@/app/api/cron/sessions/consumption/+api";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

async function seedAdmins(count: number) {
  const admins = [];
  for (let i = 0; i < count; i += 1) {
    const a = await prisma.user.create({
      data: {
        email: `admin${i}@test.local`,
        firstName: "Admin",
        lastName: String(i),
        role: "ADMIN",
      },
    });
    admins.push(a);
  }
  return admins;
}

function cronRequest() {
  return new Request("http://test.local/api/cron/sessions/consumption", {
    method: "POST",
  });
}

describe("cron:sessions unbacked-attendance notification", () => {
  beforeEach(async () => {
    await resetDb();
    createSystemNotificationMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("notifies all admins (RESERVATION_UNBACKED_ATTENDANCE) when a completed booking has no eligible package", async () => {
    const [adminA, adminB] = await seedAdmins(2);
    const trainer = await prisma.user.create({
      data: { email: "trainer@test.local", firstName: "Trainer", lastName: "Test", role: "TRAINER" },
    });
    const clientUser = await prisma.user.create({
      data: { email: "client@test.local", firstName: "Marija", lastName: "Test", role: "CLIENT" },
    });
    const clientProfile = await prisma.clientProfile.create({
      data: { userId: clientUser.id },
    });
    const reformer = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    // Session that ended 1 hour ago, no package on the client.
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() - 2 * 60 * 60 * 1000),
        endsAt: new Date(nowMs() - 60 * 60 * 1000),
        capacity: 6,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        createdByUserId: adminA.id,
      },
    });

    const res = await POST(cronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.noEligiblePackage).toBe(1);

    await new Promise((r) => setImmediate(r));

    const unbackedCalls = createSystemNotificationMock.mock.calls.filter(
      (c) => c[2] === "RESERVATION_UNBACKED_ATTENDANCE",
    );
    const recipientIds = unbackedCalls.map((c) => c[0]);
    expect(recipientIds).toContain(adminA.id);
    expect(recipientIds).toContain(adminB.id);
    expect(recipientIds).toHaveLength(2);
  });

  it("does not fire when consumption succeeds against a package", async () => {
    await seedAdmins(1);
    const trainer = await prisma.user.create({
      data: { email: "trainer@test.local", firstName: "Trainer", lastName: "Test", role: "TRAINER" },
    });
    const clientUser = await prisma.user.create({
      data: { email: "client@test.local", firstName: "Marija", lastName: "Test", role: "CLIENT" },
    });
    const clientProfile = await prisma.clientProfile.create({
      data: { userId: clientUser.id },
    });
    const reformer = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    const pt = await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 8,
        classTypeId: reformer.id,
      },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: clientProfile.id,
        packageTypeId: pt.id,
        classTypeId: reformer.id,
        lateCancelHours: 8,
        startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
        expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
        sessionsRemaining: 12,
      },
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() - 2 * 60 * 60 * 1000),
        endsAt: new Date(nowMs() - 60 * 60 * 1000),
        capacity: 6,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });

    await POST(cronRequest());
    await new Promise((r) => setImmediate(r));

    const unbackedCalls = createSystemNotificationMock.mock.calls.filter(
      (c) => c[2] === "RESERVATION_UNBACKED_ATTENDANCE",
    );
    expect(unbackedCalls).toHaveLength(0);
  });
});

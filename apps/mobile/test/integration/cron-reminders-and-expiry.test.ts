import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
  createAndDispatchUserNotification: vi.fn(async () => undefined),
  getPreferredLocale: async () => "en",
}));

import { POST as REMINDERS } from "@/app/api/cron/notifications/reminders/+api";
import { POST as EXPIRY } from "@/app/api/cron/notifications/package-expiry/+api";
import { createSystemNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";

const TOKEN = "test-bootstrap-token";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const createSystemNotificationMock = vi.mocked(createSystemNotification);

function cronRequest(url: string, withToken = true) {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (withToken) (headers as Record<string, string>)["x-cron-token"] = TOKEN;
  return new Request(url, { method: "POST", headers });
}

async function seedReformer() {
  return prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
}

async function makeClientWithProfile(email: string) {
  const user = await prisma.user.create({
    data: { email, fullName: email, role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id },
  });
  return { user, profile };
}

describe("cron: reminders + package-expiry", () => {
  beforeEach(async () => {
    await resetDb();
    createSystemNotificationMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe("reminders", () => {
    it("returns 401 without an x-cron-token header", async () => {
      const response = await REMINDERS(
        cronRequest(
          "http://test.local/api/cron/notifications/reminders?mode=immediate&windowMinutes=180",
          false,
        ),
      );
      expect(response.status).toBe(401);
      expect(createSystemNotificationMock).not.toHaveBeenCalled();
    });

    it("sends one reminder per non-canceled booking on a session inside the window", async () => {
      const reformer = await seedReformer();
      const trainer = await prisma.user.create({
        data: { email: "t@test.local", fullName: "T", role: "TRAINER" },
      });
      const c1 = await makeClientWithProfile("c1@test.local");
      const c2 = await makeClientWithProfile("c2@test.local");
      const c3 = await makeClientWithProfile("c3-canceled@test.local");

      const startsAt = new Date(Date.now() + HOUR_MS); // inside 180-min window
      const session = await prisma.session.create({
        data: {
          classTypeId: reformer.id,
          trainerUserId: trainer.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR_MS),
          capacity: 6,
          isActive: true,
          status: "SCHEDULED",
        },
      });
      await prisma.booking.createMany({
        data: [
          { sessionId: session.id, clientProfileId: c1.profile.id },
          { sessionId: session.id, clientProfileId: c2.profile.id },
          {
            sessionId: session.id,
            clientProfileId: c3.profile.id,
            canceledAt: new Date(),
          },
        ],
      });

      const response = await REMINDERS(
        cronRequest(
          "http://test.local/api/cron/notifications/reminders?mode=immediate&windowMinutes=180",
        ),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { sent: number };
      expect(body.sent).toBe(2);
      expect(createSystemNotificationMock).toHaveBeenCalledTimes(2);
      const recipients = createSystemNotificationMock.mock.calls.map((c) => c[0]);
      expect(recipients).toEqual(
        expect.arrayContaining([c1.user.id, c2.user.id]),
      );
      expect(recipients).not.toContain(c3.user.id);
    });

    it("does not send reminders for sessions outside the window", async () => {
      const reformer = await seedReformer();
      const trainer = await prisma.user.create({
        data: { email: "t2@test.local", fullName: "T2", role: "TRAINER" },
      });
      const c = await makeClientWithProfile("future@test.local");
      const startsAt = new Date(Date.now() + 5 * DAY_MS); // far outside 180min
      const session = await prisma.session.create({
        data: {
          classTypeId: reformer.id,
          trainerUserId: trainer.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR_MS),
          capacity: 6,
          isActive: true,
          status: "SCHEDULED",
        },
      });
      await prisma.booking.create({
        data: { sessionId: session.id, clientProfileId: c.profile.id },
      });

      const response = await REMINDERS(
        cronRequest(
          "http://test.local/api/cron/notifications/reminders?mode=immediate&windowMinutes=180",
        ),
      );
      const body = (await response.json()) as { sent: number };
      expect(body.sent).toBe(0);
      expect(createSystemNotificationMock).not.toHaveBeenCalled();
    });
  });

  describe("package-expiry", () => {
    it("returns 401 without an x-cron-token header", async () => {
      const response = await EXPIRY(
        cronRequest(
          "http://test.local/api/cron/notifications/package-expiry?mode=immediate&windowDays=30",
          false,
        ),
      );
      expect(response.status).toBe(401);
    });

    it("sends an expiry notification for active packages whose effective expiry is inside the window", async () => {
      const reformer = await seedReformer();
      const c = await makeClientWithProfile("expiring@test.local");
      const packageType = await prisma.packageType.create({
        data: {
          name: "Reformer 12",
          sessionCount: 12,
          validityDays: 30,
          lateCancelHours: 12,
          classTypeId: reformer.id,
        },
      });
      // Pack expires in 5 days, sessionsRemaining > 0, started in the past.
      await prisma.clientPackage.create({
        data: {
          clientProfileId: c.profile.id,
          packageTypeId: packageType.id,
          classTypeId: reformer.id,
          lateCancelHours: 12,
          startsAt: new Date(Date.now() - 5 * DAY_MS),
          expiresAt: new Date(Date.now() + 5 * DAY_MS),
          sessionsRemaining: 4,
        },
      });

      const response = await EXPIRY(
        cronRequest(
          "http://test.local/api/cron/notifications/package-expiry?mode=immediate&windowDays=30",
        ),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { sent: number };
      expect(body.sent).toBe(1);
      expect(createSystemNotificationMock).toHaveBeenCalledWith(
        c.user.id,
        expect.anything(),
        "GENERAL",
        expect.objectContaining({ sessionsRemaining: 4 }),
        expect.stringMatching(/^package-expiry:/),
      );
    });

    it("does not notify for packages with zero sessions remaining or those expiring outside the window", async () => {
      const reformer = await seedReformer();
      const noSessions = await makeClientWithProfile("zero@test.local");
      const farFuture = await makeClientWithProfile("far@test.local");
      const packageType = await prisma.packageType.create({
        data: {
          name: "Reformer 12",
          sessionCount: 12,
          validityDays: 30,
          lateCancelHours: 12,
          classTypeId: reformer.id,
        },
      });
      await prisma.clientPackage.create({
        data: {
          clientProfileId: noSessions.profile.id,
          packageTypeId: packageType.id,
          classTypeId: reformer.id,
          lateCancelHours: 12,
          startsAt: new Date(Date.now() - DAY_MS),
          expiresAt: new Date(Date.now() + 5 * DAY_MS),
          sessionsRemaining: 0,
        },
      });
      await prisma.clientPackage.create({
        data: {
          clientProfileId: farFuture.profile.id,
          packageTypeId: packageType.id,
          classTypeId: reformer.id,
          lateCancelHours: 12,
          startsAt: new Date(Date.now() - DAY_MS),
          expiresAt: new Date(Date.now() + 90 * DAY_MS),
          sessionsRemaining: 8,
        },
      });

      const response = await EXPIRY(
        cronRequest(
          "http://test.local/api/cron/notifications/package-expiry?mode=immediate&windowDays=30",
        ),
      );
      const body = (await response.json()) as { sent: number };
      expect(body.sent).toBe(0);
      expect(createSystemNotificationMock).not.toHaveBeenCalled();
    });
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
  createAndDispatchUserNotification: vi.fn(async () => undefined),
  getPreferredLocale: async () => "en",
}));

import { POST as REMINDERS } from "@/server/routes/cron/notifications/reminders";
import { POST as EXPIRY } from "@/server/routes/cron/notifications/package-expiry";
import { now, nowMs } from "@/lib/now";
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
  const [firstName, ...rest] = email.split(" ");
  const lastName = rest.join(" ") || "Test";
  const user = await prisma.user.create({
    data: { email, firstName, lastName, role: "CLIENT" },
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
        data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
      });
      const c1 = await makeClientWithProfile("c1@test.local");
      const c2 = await makeClientWithProfile("c2@test.local");
      const c3 = await makeClientWithProfile("c3-canceled@test.local");

      const startsAt = new Date(nowMs() + HOUR_MS); // inside 180-min window
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
            canceledAt: now(),
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
      // `sent` counts client reminders only; the session's trainer also gets a
      // daily digest, which is counted separately under trainerDigestsSent.
      const clientCalls = createSystemNotificationMock.mock.calls.filter(
        (c) => c[1] === "SESSION_REMINDER",
      );
      expect(clientCalls).toHaveLength(2);
      const recipients = clientCalls.map((c) => c[0]);
      expect(recipients).toEqual(
        expect.arrayContaining([c1.user.id, c2.user.id]),
      );
      expect(recipients).not.toContain(c3.user.id);
    });

    it("does not send reminders for sessions outside the window", async () => {
      const reformer = await seedReformer();
      const trainer = await prisma.user.create({
        data: { email: "t2@test.local", firstName: "T2", lastName: "Test", role: "TRAINER" },
      });
      const c = await makeClientWithProfile("future@test.local");
      const startsAt = new Date(nowMs() + 5 * DAY_MS); // far outside 180min
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

  describe("trainer reminders", () => {
    /**
     * One digest per trainer per studio day, not one push per session: a
     * trainer running six classes would otherwise get six separate buzzes for
     * a single workday.
     */
    it("sends the trainer a single digest covering all their sessions in the window", async () => {
      const reformer = await seedReformer();
      const trainer = await prisma.user.create({
        data: { email: "digest@test.local", firstName: "D", lastName: "Test", role: "TRAINER" },
      });
      const client = await makeClientWithProfile("dc@test.local");

      const first = new Date(nowMs() + HOUR_MS);
      const second = new Date(nowMs() + 2 * HOUR_MS);
      for (const startsAt of [first, second]) {
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
          data: { sessionId: session.id, clientProfileId: client.profile.id },
        });
      }

      const response = await REMINDERS(
        cronRequest(
          "http://test.local/api/cron/notifications/reminders?mode=immediate&windowMinutes=180",
        ),
      );
      expect(response.status).toBe(200);

      const trainerCalls = createSystemNotificationMock.mock.calls.filter(
        (c) => c[0] === trainer.id,
      );
      expect(trainerCalls).toHaveLength(1);
      expect(trainerCalls[0][1]).toBe("TRAINER_DAILY_SCHEDULE");
      expect(trainerCalls[0][3]).toMatchObject({ count: 2 });
    });

    it("counts sessions with no bookings — an empty class is still the trainer's shift", async () => {
      const reformer = await seedReformer();
      const trainer = await prisma.user.create({
        data: { email: "empty@test.local", firstName: "E", lastName: "Test", role: "TRAINER" },
      });
      const startsAt = new Date(nowMs() + HOUR_MS);
      await prisma.session.create({
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

      await REMINDERS(
        cronRequest(
          "http://test.local/api/cron/notifications/reminders?mode=immediate&windowMinutes=180",
        ),
      );

      const trainerCalls = createSystemNotificationMock.mock.calls.filter(
        (c) => c[0] === trainer.id,
      );
      expect(trainerCalls).toHaveLength(1);
      expect(trainerCalls[0][3]).toMatchObject({ count: 1 });
    });

    it("gives each trainer their own digest", async () => {
      const reformer = await seedReformer();
      const a = await prisma.user.create({
        data: { email: "ta@test.local", firstName: "A", lastName: "T", role: "TRAINER" },
      });
      const b = await prisma.user.create({
        data: { email: "tb@test.local", firstName: "B", lastName: "T", role: "TRAINER" },
      });
      const startsAt = new Date(nowMs() + HOUR_MS);
      for (const trainerUserId of [a.id, b.id]) {
        await prisma.session.create({
          data: {
            classTypeId: reformer.id,
            trainerUserId,
            startsAt,
            endsAt: new Date(startsAt.getTime() + HOUR_MS),
            capacity: 6,
            isActive: true,
            status: "SCHEDULED",
          },
        });
      }

      await REMINDERS(
        cronRequest(
          "http://test.local/api/cron/notifications/reminders?mode=immediate&windowMinutes=180",
        ),
      );

      const recipients = createSystemNotificationMock.mock.calls.map((c) => c[0]);
      expect(recipients.filter((r) => r === a.id)).toHaveLength(1);
      expect(recipients.filter((r) => r === b.id)).toHaveLength(1);
    });

    it("passes a dedupeKey so a second cron run does not double-send", async () => {
      const reformer = await seedReformer();
      const trainer = await prisma.user.create({
        data: { email: "idem@test.local", firstName: "I", lastName: "T", role: "TRAINER" },
      });
      const startsAt = new Date(nowMs() + HOUR_MS);
      await prisma.session.create({
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

      const url =
        "http://test.local/api/cron/notifications/reminders?mode=immediate&windowMinutes=180";
      await REMINDERS(cronRequest(url));
      await REMINDERS(cronRequest(url));

      const trainerCalls = createSystemNotificationMock.mock.calls.filter(
        (c) => c[0] === trainer.id,
      );
      // The route is called twice; dedupe is enforced by the notificationKey
      // unique index downstream, so both calls MUST carry the same key.
      expect(trainerCalls).toHaveLength(2);
      const keys = trainerCalls.map((c) => (c[4] as { dedupeKey?: string })?.dedupeKey);
      expect(keys[0]).toBeDefined();
      expect(keys[0]).toBe(keys[1]);
      expect(keys[0]).toMatch(/^trainer-daily-schedule:/);
    });

    it("does not notify a trainer whose sessions are outside the window", async () => {
      const reformer = await seedReformer();
      const trainer = await prisma.user.create({
        data: { email: "far@test.local", firstName: "F", lastName: "T", role: "TRAINER" },
      });
      const startsAt = new Date(nowMs() + 5 * DAY_MS);
      await prisma.session.create({
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

      await REMINDERS(
        cronRequest(
          "http://test.local/api/cron/notifications/reminders?mode=immediate&windowMinutes=180",
        ),
      );

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
          classTypes: { create: { classTypeId: reformer.id } },
        },
      });
      // Pack expires in 5 days, sessionsRemaining > 0, started in the past.
      await prisma.clientPackage.create({
        data: {
          clientProfileId: c.profile.id,
          packageTypeId: packageType.id,
          classTypes: { create: { classTypeId: reformer.id } },
          lateCancelHours: 12,
          startsAt: new Date(nowMs() - 5 * DAY_MS),
          expiresAt: new Date(nowMs() + 5 * DAY_MS),
          sessionsRemaining: 4,
          sessionsGranted: 4,
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
        expect.objectContaining({ dedupeKey: expect.stringMatching(/^package-expiry:/) }),
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
          classTypes: { create: { classTypeId: reformer.id } },
        },
      });
      await prisma.clientPackage.create({
        data: {
          clientProfileId: noSessions.profile.id,
          packageTypeId: packageType.id,
          classTypes: { create: { classTypeId: reformer.id } },
          lateCancelHours: 12,
          startsAt: new Date(nowMs() - DAY_MS),
          expiresAt: new Date(nowMs() + 5 * DAY_MS),
          sessionsRemaining: 0,
          sessionsGranted: 0,
        },
      });
      await prisma.clientPackage.create({
        data: {
          clientProfileId: farFuture.profile.id,
          packageTypeId: packageType.id,
          classTypes: { create: { classTypeId: reformer.id } },
          lateCancelHours: 12,
          startsAt: new Date(nowMs() - DAY_MS),
          expiresAt: new Date(nowMs() + 90 * DAY_MS),
          sessionsRemaining: 8,
          sessionsGranted: 8,
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

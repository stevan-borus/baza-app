import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/cron-auth", () => ({
  requireCronAuth: () => ({ ok: true as const }),
}));

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST as POST_BIRTHDAYS } from "@/server/routes/cron/notifications/birthdays";
import { createSystemNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

const createSystemNotificationMock = vi.mocked(createSystemNotification);

function buildCronRequest(params: Record<string, string> = {}) {
  const url = new URL("http://test.local/api/cron/notifications/birthdays");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: "POST" });
}

async function seedAdmin(email = "admin@test.local") {
  return prisma.user.create({
    data: { email, firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
}

async function seedClientWithBirthday(opts: {
  email: string;
  fullName: string;
  dateOfBirth: string | null; // YYYY-MM-DD or null
}) {
  const [firstName, ...rest] = opts.fullName.split(" ");
  const lastName = rest.join(" ") || "Test";
  return prisma.user.create({
    data: {
      email: opts.email,
      firstName,
      lastName,
      role: "CLIENT",
      clientProfile: {
        create: opts.dateOfBirth
          ? { dateOfBirth: new Date(opts.dateOfBirth) }
          : {},
      },
    },
    select: { id: true, clientProfile: { select: { id: true } } },
  });
}

describe("cron:birthdays", () => {
  beforeEach(async () => {
    await resetDb();
    createSystemNotificationMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("notifies admin for a client whose MM-DD matches today (anchor=2026-05-09)", async () => {
    const today = now().toISOString().slice(0, 10); // e.g. "2026-05-09"
    const mmdd = today.slice(5); // e.g. "05-09"

    const admin = await seedAdmin();
    const birthdayClient = await seedClientWithBirthday({
      email: "matches@test.local",
      fullName: "Birthday Today",
      dateOfBirth: `1990-${mmdd}`,
    });
    await seedClientWithBirthday({
      email: "other@test.local",
      fullName: "Different Day",
      dateOfBirth: "1985-08-22",
    });

    const res = await POST_BIRTHDAYS(buildCronRequest());
    expect(res.status).toBe(200);

    const adminCalls = createSystemNotificationMock.mock.calls.filter(
      (call) => call[0] === admin.id && call[2] === "BIRTHDAY_ADMIN_PROMPT",
    );
    expect(adminCalls).toHaveLength(1);
    expect(adminCalls[0][3]).toMatchObject({
      clientProfileId: birthdayClient.clientProfile!.id,
      clientFullName: "Birthday Today",
    });
  });

  it("notifies all active admins (skips inactive)", async () => {
    const today = now().toISOString().slice(0, 10);
    const mmdd = today.slice(5);

    const a1 = await seedAdmin("a1@test.local");
    const a2 = await seedAdmin("a2@test.local");
    await prisma.user.create({
      data: { email: "inactive@test.local", firstName: "Inactive", lastName: "Test", role: "ADMIN", isActive: false },
    });
    await seedClientWithBirthday({
      email: "client@test.local",
      fullName: "Client",
      dateOfBirth: `1990-${mmdd}`,
    });

    await POST_BIRTHDAYS(buildCronRequest());

    const notifiedAdminIds = createSystemNotificationMock.mock.calls
      .filter((call) => call[2] === "BIRTHDAY_ADMIN_PROMPT")
      .map((call) => call[0])
      .sort();
    expect(notifiedAdminIds).toEqual([a1.id, a2.id].sort());
  });

  it("dedupes per recipient: birthday:{clientUserId}:{YYYY-MM-DD}:{adminId}", async () => {
    const today = now().toISOString().slice(0, 10);
    const mmdd = today.slice(5);

    const a1 = await seedAdmin("a1@test.local");
    const a2 = await seedAdmin("a2@test.local");
    const client = await seedClientWithBirthday({
      email: "client@test.local",
      fullName: "Client",
      dateOfBirth: `1990-${mmdd}`,
    });

    await POST_BIRTHDAYS(buildCronRequest());

    const promptCalls = createSystemNotificationMock.mock.calls.filter(
      (call) => call[2] === "BIRTHDAY_ADMIN_PROMPT",
    );
    expect(promptCalls).toHaveLength(2);
    // Each admin's send carries their own dedupe key (client+day+recipient),
    // so every admin gets a NotificationLog row while cron retries stay
    // idempotent per recipient.
    const keysByAdmin = new Map(
      promptCalls.map((call) => [call[0], (call[4] as { dedupeKey?: string })?.dedupeKey]),
    );
    expect(keysByAdmin.get(a1.id)).toBe(`birthday:${client.id}:${today}:${a1.id}`);
    expect(keysByAdmin.get(a2.id)).toBe(`birthday:${client.id}:${today}:${a2.id}`);
  });

  it("dryRun=true counts matches but does not call createSystemNotification", async () => {
    const today = now().toISOString().slice(0, 10);
    const mmdd = today.slice(5);

    await seedAdmin();
    await seedClientWithBirthday({
      email: "client@test.local",
      fullName: "Client",
      dateOfBirth: `1990-${mmdd}`,
    });

    const res = await POST_BIRTHDAYS(buildCronRequest({ dryRun: "true" }));
    const json = (await res.json()) as { sent: number; matchedClients: number };
    expect(res.status).toBe(200);
    expect(json.matchedClients).toBe(1);
    expect(createSystemNotificationMock).not.toHaveBeenCalled();
  });

  it("uses the Belgrade calendar day, not the server's UTC day", async () => {
    // 22:30Z on 21 Aug is already 00:30 on the 22nd in Belgrade (CEST,
    // UTC+2). Reading "today" off the UTC clock is what let a birthday
    // prompt fire at 23:xx local: the UTC date rolls over first, wins the
    // per-day dedupe key, and suppresses the sensible daytime send.
    const previousAnchor = process.env.TEST_ANCHOR_TIME;
    process.env.TEST_ANCHOR_TIME = "2026-08-21T22:30:00Z";
    try {
      const admin = await seedAdmin();
      const belgradeBirthday = await seedClientWithBirthday({
        email: "belgrade-day@test.local",
        fullName: "Belgrade Day",
        dateOfBirth: "1990-08-22",
      });
      await seedClientWithBirthday({
        email: "utc-day@test.local",
        fullName: "Utc Day",
        dateOfBirth: "1990-08-21",
      });

      const res = await POST_BIRTHDAYS(buildCronRequest());
      expect(res.status).toBe(200);

      const promptCalls = createSystemNotificationMock.mock.calls.filter(
        (call) => call[2] === "BIRTHDAY_ADMIN_PROMPT",
      );
      expect(promptCalls).toHaveLength(1);
      expect(promptCalls[0][3]).toMatchObject({
        clientProfileId: belgradeBirthday.clientProfile!.id,
        clientFullName: "Belgrade Day",
        today: "2026-08-22",
      });
      expect((promptCalls[0][4] as { dedupeKey?: string })?.dedupeKey).toBe(
        `birthday:${belgradeBirthday.id}:2026-08-22:${admin.id}`,
      );
    } finally {
      process.env.TEST_ANCHOR_TIME = previousAnchor;
    }
  });

  it("falls back to Mar 1 for Feb 29 birthday in non-leap year (2026)", async () => {
    const previousAnchor = process.env.TEST_ANCHOR_TIME;
    process.env.TEST_ANCHOR_TIME = "2026-03-01T10:00:00Z";
    try {
      const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      expect(isLeapYear(now().getUTCFullYear())).toBe(false);

      const admin = await seedAdmin();
      const leaplingClient = await seedClientWithBirthday({
        email: "leapling@test.local",
        fullName: "Leap Ling",
        dateOfBirth: "1996-02-29",
      });

      const res = await POST_BIRTHDAYS(buildCronRequest());
      expect(res.status).toBe(200);

      const adminCalls = createSystemNotificationMock.mock.calls.filter(
        (call) => call[0] === admin.id && call[2] === "BIRTHDAY_ADMIN_PROMPT",
      );
      expect(adminCalls).toHaveLength(1);
      expect(adminCalls[0][3]).toMatchObject({
        clientProfileId: leaplingClient.clientProfile!.id,
        clientFullName: "Leap Ling",
        today: "2026-03-01",
      });
    } finally {
      process.env.TEST_ANCHOR_TIME = previousAnchor;
    }
  });
});

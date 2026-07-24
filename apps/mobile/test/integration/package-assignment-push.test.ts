/**
 * Feature 2 — push the client when a package is assigned or paid.
 *
 * Both dispatch sites route through notifyClient → createSystemNotification,
 * so we keep those real (writing a NotificationLog row) and mock ONLY the Expo
 * push dispatch (createAndDispatchUserNotification) to avoid network. That lets
 * us assert the persisted row's type + message key + interpolated body.
 *
 * The registry declares these events as in-app-only (no email), so we also spy
 * on the booking-email sender to prove neither event emails the client.
 *
 * Verified:
 *   1. naplata POST (activated package) → PACKAGE_ASSIGNED row, PACKAGE_PURCHASED copy
 *   2. non-gift dodeli POST → PACKAGE_ASSIGNED row, PACKAGE_ASSIGNED copy
 *   3. gift dodeli POST → still BIRTHDAY_CLIENT_GIFT (regression guard)
 *   4. neither new event sends an email
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

// Keep createSystemNotification real (writes the log row); stub only the Expo
// push leg so nothing hits the network.
vi.mock("@/lib/server/notifications", async () => {
  const actual = await import("@/lib/server/notifications");
  return {
    ...actual,
    createAndDispatchUserNotification: vi.fn(
      async (input: Parameters<typeof actual.createAndDispatchUserNotification>[0]) => {
        const { prisma } = await import("@/lib/server/prisma");
        const { Prisma } = await import("@/generated/prisma");
        const jsonPayload =
          input.payload === undefined
            ? undefined
            : (JSON.parse(JSON.stringify(input.payload)) as typeof Prisma.JsonNull);
        return prisma.notificationLog.create({
          data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body,
            payload: jsonPayload,
          },
          select: {
            id: true,
            userId: true,
            type: true,
            title: true,
            body: true,
            payload: true,
            pushSent: true,
            pushStatus: true,
            readAt: true,
            createdAt: true,
          },
        });
      },
    ),
  };
});

// Spy on the booking-email sender so we can prove the new events send no email.
vi.mock("@/lib/server/booking-emails", () => ({
  sendBookingChangeEmailToRecipient: vi.fn(async () => undefined),
}));

import { POST as POST_BILLING } from "@/server/routes/billing";
import { POST as POST_CLIENT_PACKAGE } from "@/server/routes/packages/client-packages";
import { sendBookingChangeEmailToRecipient } from "@/lib/server/booking-emails";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

const emailMock = vi.mocked(sendBookingChangeEmailToRecipient);

async function seedAdminClientAndPackage(opts?: { isBirthdayGift?: boolean }) {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
  const clientUser = await prisma.user.create({
    data: {
      email: "client@test.local",
      firstName: "Client",
      lastName: "User",
      role: "CLIENT",
      clientProfile: { create: {} },
    },
    select: { id: true, clientProfile: { select: { id: true } } },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 8",
      sessionCount: 8,
      validityDays: 60,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: classType.id } },
      isBirthdayGift: opts?.isBirthdayGift ?? false,
    },
  });
  return {
    admin,
    clientUserId: clientUser.id,
    clientProfileId: clientUser.clientProfile!.id,
    packageType,
  };
}

function buildBillingRequest(body: unknown) {
  return new Request("http://test.local/api/billing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildAssignRequest(body: unknown) {
  return new Request("http://test.local/api/packages/client-packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("package-assignment push", () => {
  beforeEach(async () => {
    await resetDb();
    emailMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("naplata POST pushes PACKAGE_ASSIGNED with the PACKAGE_PURCHASED copy", async () => {
    const { clientUserId, packageType } = await seedAdminClientAndPackage();

    const res = await POST_BILLING(
      buildBillingRequest({
        clientUserId,
        amount: 24000,
        method: "CARD",
        packageTypeId: packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(res.status).toBe(201);

    const logs = await vi.waitFor(async () => {
      const rows = await prisma.notificationLog.findMany({
        where: { userId: clientUserId, type: "PACKAGE_ASSIGNED" },
      });
      expect(rows).toHaveLength(1);
      return rows;
    });
    // Purchase copy names the package and mentions payment (sr default).
    expect(logs[0].body).toBe("Uplata je evidentirana — paket Reformer 8 je aktivan.");
    expect(logs[0].payload).toMatchObject({
      messageKey: "notification.package_purchased",
      packageTypeName: "Reformer 8",
    });
  });

  it("non-gift dodeli POST pushes PACKAGE_ASSIGNED with the PACKAGE_ASSIGNED copy", async () => {
    const { clientProfileId, clientUserId, packageType } = await seedAdminClientAndPackage();

    const res = await POST_CLIENT_PACKAGE(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const logs = await vi.waitFor(async () => {
      const rows = await prisma.notificationLog.findMany({
        where: { userId: clientUserId, type: "PACKAGE_ASSIGNED" },
      });
      expect(rows).toHaveLength(1);
      return rows;
    });
    // Grant copy — no payment language.
    expect(logs[0].body).toBe("Dodeljen vam je paket Reformer 8.");
    expect(logs[0].payload).toMatchObject({
      messageKey: "notification.package_assigned",
      packageTypeName: "Reformer 8",
    });
  });

  it("gift dodeli POST still pushes BIRTHDAY_CLIENT_GIFT (regression guard)", async () => {
    const { clientProfileId, clientUserId, packageType } = await seedAdminClientAndPackage({
      isBirthdayGift: true,
    });

    const res = await POST_CLIENT_PACKAGE(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
      }),
    );
    expect(res.status).toBe(201);

    const logs = await vi.waitFor(async () => {
      const rows = await prisma.notificationLog.findMany({
        where: { userId: clientUserId },
      });
      expect(rows).toHaveLength(1);
      return rows;
    });
    // The gift branch keeps its own event — it must NOT also fire PACKAGE_ASSIGNED.
    expect(logs[0].type).toBe("BIRTHDAY_CLIENT_GIFT");
  });

  it("neither new event emails the client", async () => {
    const { clientProfileId, clientUserId, packageType } = await seedAdminClientAndPackage();

    await POST_BILLING(
      buildBillingRequest({
        clientUserId,
        amount: 24000,
        method: "CARD",
        packageTypeId: packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    await POST_CLIENT_PACKAGE(
      buildAssignRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
      }),
    );

    // Give any fire-and-forget dispatch a tick to settle, then assert no email.
    await vi.waitFor(async () => {
      const rows = await prisma.notificationLog.findMany({
        where: { userId: clientUserId, type: "PACKAGE_ASSIGNED" },
      });
      expect(rows).toHaveLength(2);
    });
    expect(emailMock).not.toHaveBeenCalled();
  });
});

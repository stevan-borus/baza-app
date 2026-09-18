/**
 * Gift occasion routing on POST /api/packages/client-packages.
 *
 * Every gifted package used to send BIRTHDAY_CLIENT_GIFT copy — so a
 * graduation, apology or promo gift wished the client a happy birthday. The
 * sheet now sends an explicit `occasion`, and only "BIRTHDAY" (or a legacy 🎂
 * SKU) keeps the birthday wording. The optional `giftMessage` is admin free
 * text appended to the body verbatim, never interpolated.
 *
 * The Prisma NotificationType stays BIRTHDAY_CLIENT_GIFT for routing; only
 * the payload's messageKey and the copy differ.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

// Keep createSystemNotification real (it renders the copy and writes the log
// row); stub only the Expo push leg.
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
          select: { id: true, userId: true, type: true, payload: true },
        });
      },
    ),
  };
});

import { POST } from "@/server/routes/packages/client-packages";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

async function seed(opts?: { isBirthdayGift?: boolean }) {
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
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      price: 15000,
      classTypes: { create: { classTypeId: classType.id } },
      isBirthdayGift: opts?.isBirthdayGift ?? false,
    },
  });
  return {
    clientUserId: clientUser.id,
    clientProfileId: clientUser.clientProfile!.id,
    packageType,
  };
}

function buildRequest(body: unknown) {
  return new Request("http://test.local/api/packages/client-packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function giftLog(clientUserId: string) {
  return vi.waitFor(async () => {
    const rows = await prisma.notificationLog.findMany({
      where: { userId: clientUserId, type: "BIRTHDAY_CLIENT_GIFT" },
    });
    expect(rows).toHaveLength(1);
    return rows[0];
  });
}

describe("client-packages gift occasion copy", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("a non-birthday gift gets the generic copy with the admin's message appended", async () => {
    const { clientProfileId, clientUserId, packageType } = await seed();

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
        isGift: true,
        sessionsGranted: 3,
        occasion: "OTHER",
        giftMessage: "Čestitamo na diplomi!",
      }),
    );
    expect(res.status).toBe(201);

    const log = await giftLog(clientUserId);
    const payload = log.payload as {
      messageKey?: string;
      giftMessage?: string;
      sessionsGranted?: number;
    };
    expect(payload.messageKey).toBe("notification.gift_package");
    expect(payload.giftMessage).toBe("Čestitamo na diplomi!");
    expect(payload.sessionsGranted).toBe(3);

    expect(log.title).toBe("🎁 Poklon za tebe");
    // Serbian 2–4 form, and the free text lands as its own sentence.
    expect(log.body).toBe(
      'Poklanjamo ti 3 termina iz paketa "Reformer 12".\n\nČestitamo na diplomi!',
    );
  });

  it("a birthday-prompt gift keeps the birthday copy", async () => {
    const { clientProfileId, clientUserId, packageType } = await seed();

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
        isGift: true,
        occasion: "BIRTHDAY",
      }),
    );
    expect(res.status).toBe(201);

    const log = await giftLog(clientUserId);
    const payload = log.payload as { messageKey?: string };
    expect(payload.messageKey).toBe("notification.birthday_client_gift");
    expect(log.title).toContain("Srećan rođendan");
  });

  it("a legacy birthday SKU keeps the birthday copy with no occasion sent", async () => {
    const { clientProfileId, clientUserId, packageType } = await seed({
      isBirthdayGift: true,
    });

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
        isGift: true,
      }),
    );
    expect(res.status).toBe(201);

    const log = await giftLog(clientUserId);
    const payload = log.payload as { messageKey?: string };
    expect(payload.messageKey).toBe("notification.birthday_client_gift");
  });

  it("rejects a giftMessage without isGift", async () => {
    const { clientProfileId, packageType } = await seed();

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
        giftMessage: "Hvala!",
      }),
    );
    expect(res.status).toBe(400);
    expect(await prisma.clientPackage.count()).toBe(0);
  });
});

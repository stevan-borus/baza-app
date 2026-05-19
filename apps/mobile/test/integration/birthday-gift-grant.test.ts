import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role)) return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/packages/client-packages/+api";
import { createSystemNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

const createSystemNotificationMock = vi.mocked(createSystemNotification);

async function seedAdminAndClient() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
  });
  setMockUser({
    id: admin.id, role: "ADMIN", email: admin.email, isActive: true,
    clientProfile: null,
  });
  const clientUser = await prisma.user.create({
    data: {
      email: "client@test.local",
      fullName: "Client",
      role: "CLIENT",
      clientProfile: { create: {} },
    },
    select: { id: true, clientProfile: { select: { id: true } } },
  });
  return { admin, clientUserId: clientUser.id, clientProfileId: clientUser.clientProfile!.id };
}

async function seedPackageType(opts: { name: string; isBirthdayGift: boolean; sessionCount?: number }) {
  const classType = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return prisma.packageType.create({
    data: {
      name: opts.name,
      sessionCount: opts.sessionCount ?? (opts.isBirthdayGift ? 1 : 12),
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: classType.id,
      isBirthdayGift: opts.isBirthdayGift,
    },
  });
}

function buildAssignRequest(body: unknown) {
  return new Request("http://test.local/api/packages/client-packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("birthday gift grant", () => {
  beforeEach(async () => {
    await resetDb();
    createSystemNotificationMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("fires BIRTHDAY_CLIENT_GIFT when an isBirthdayGift PackageType is assigned", async () => {
    const { clientProfileId, clientUserId } = await seedAdminAndClient();
    const giftPackageType = await seedPackageType({ name: "Birthday Gift", isBirthdayGift: true });

    const res = await POST(buildAssignRequest({
      clientProfileId,
      packageTypeId: giftPackageType.id,
      startsAt: now().toISOString(),
    }));
    expect(res.status).toBe(201);

    await vi.waitFor(() => {
      const giftCalls = createSystemNotificationMock.mock.calls.filter(
        (call) => call[0] === clientUserId && call[2] === "BIRTHDAY_CLIENT_GIFT",
      );
      expect(giftCalls).toHaveLength(1);
    });
  });

  it("does NOT fire BIRTHDAY_CLIENT_GIFT for regular PackageTypes", async () => {
    const { clientProfileId } = await seedAdminAndClient();
    const regular = await seedPackageType({ name: "Regular 12-pack", isBirthdayGift: false });

    const res = await POST(buildAssignRequest({
      clientProfileId,
      packageTypeId: regular.id,
      startsAt: now().toISOString(),
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50));
    const giftCalls = createSystemNotificationMock.mock.calls.filter(
      (call) => call[2] === "BIRTHDAY_CLIENT_GIFT",
    );
    expect(giftCalls).toHaveLength(0);
  });
});

/**
 * Feature 3 — birthday gift via one SKU + a class-type picker.
 *
 * POST /api/packages/client-packages accepts an optional `classTypeIdsOverride`
 * that only a birthday-gift SKU honors: the created ClientPackage snapshots the
 * picked set instead of the SKU's own covered set, so one 🎂 SKU can be gifted
 * against any class type without a per-class-type SKU.
 *
 * Verified:
 *   1. gift + override → snapshot = override set; booking eligibility follows it
 *      (eligible for the picked class type, not the SKU's own class type)
 *   2. override with an unknown ClassType id → 400
 *   3. override on a NON-gift SKU → 400
 *   4. BIRTHDAY_CLIENT_GIFT push payload carries the override set, not the SKU's
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

// Keep createSystemNotification real (writes the log row) so we can read back
// the persisted BIRTHDAY_CLIENT_GIFT payload; stub only the Expo push leg.
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
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
import { ensureSystemBirthdayGift, SYSTEM_BIRTHDAY_GIFT_ID } from "@/lib/server/system-gift";

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
  // Two distinct class types: the SKU covers `mat`, the admin gifts `reformer`.
  const mat = await prisma.classType.create({
    data: { name: "Mat", maxClients: 10, durationMins: 60 },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Rođendanski poklon",
      sessionCount: 1,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: mat.id } },
      isBirthdayGift: opts?.isBirthdayGift ?? true,
    },
  });
  return {
    clientUserId: clientUser.id,
    clientProfileId: clientUser.clientProfile!.id,
    mat,
    reformer,
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

describe("client-packages gift class-type override", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("gift + override snapshots the picked class type, and eligibility follows it", async () => {
    const { clientProfileId, mat, reformer, packageType } = await seed();

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
        classTypeIdsOverride: [reformer.id],
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      clientPackage: { id: string; classTypeIds: string[] };
    };
    // The response echoes the actual snapshot — the picked set, not the SKU's.
    expect(body.clientPackage.classTypeIds).toEqual([reformer.id]);

    // The persisted join rows snapshot the override, not the SKU's `mat` set.
    const snapshot = await prisma.clientPackageClassType.findMany({
      where: { clientPackageId: body.clientPackage.id },
      select: { classTypeId: true },
    });
    expect(snapshot.map((s) => s.classTypeId)).toEqual([reformer.id]);

    // Booking eligibility follows the snapshot: eligible for the picked
    // Reformer class, NOT for the SKU's own Mat class.
    const created = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: body.clientPackage.id },
      select: {
        id: true,
        startsAt: true,
        expiresAt: true,
        sessionsRemaining: true,
        revokedAt: true,
        classTypes: { select: { classTypeId: true } },
      },
    });
    const eligibilityPackage = {
      id: created.id,
      classTypeIds: created.classTypes.map((c) => c.classTypeId),
      startsAt: created.startsAt,
      expiresAt: created.expiresAt,
      sessionsRemaining: created.sessionsRemaining,
      revokedAt: created.revokedAt,
    };
    const at = now();
    expect(
      findEligibleClientPackage([eligibilityPackage], [], at, reformer.id),
    ).not.toBeNull();
    expect(
      findEligibleClientPackage([eligibilityPackage], [], at, mat.id),
    ).toBeNull();
  });

  it("override with an unknown ClassType id → 400", async () => {
    const { clientProfileId, packageType } = await seed();

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
        classTypeIdsOverride: ["ct-does-not-exist"],
      }),
    );
    expect(res.status).toBe(400);
    // Nothing was created.
    expect(await prisma.clientPackage.count()).toBe(0);
  });

  it("override on a NON-gift SKU → 400", async () => {
    const { clientProfileId, reformer, packageType } = await seed({
      isBirthdayGift: false,
    });

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
        classTypeIdsOverride: [reformer.id],
      }),
    );
    expect(res.status).toBe(400);
    expect(await prisma.clientPackage.count()).toBe(0);
  });

  it("BIRTHDAY_CLIENT_GIFT push payload carries the override set, not the SKU's", async () => {
    const { clientProfileId, clientUserId, mat, reformer, packageType } =
      await seed();

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: packageType.id,
        startsAt: now().toISOString(),
        classTypeIdsOverride: [reformer.id],
      }),
    );
    expect(res.status).toBe(201);

    const logs = await vi.waitFor(async () => {
      const rows = await prisma.notificationLog.findMany({
        where: { userId: clientUserId, type: "BIRTHDAY_CLIENT_GIFT" },
      });
      expect(rows).toHaveLength(1);
      return rows;
    });
    const payload = logs[0].payload as { classTypeIds?: string[] };
    expect(payload.classTypeIds).toEqual([reformer.id]);
    expect(payload.classTypeIds).not.toContain(mat.id);
  });

  it("system gift (no covered set) + a 2-class-type override snapshots both, both bookable", async () => {
    // The built-in system gift links NO class types of its own — the override
    // is the sole source of coverage. Ensure the row, then assign it with two
    // picked class types and assert both are snapshotted and eligible.
    const { clientProfileId, mat, reformer } = await seed();
    await ensureSystemBirthdayGift(prisma);

    const res = await POST(
      buildRequest({
        clientProfileId,
        packageTypeId: SYSTEM_BIRTHDAY_GIFT_ID,
        startsAt: now().toISOString(),
        classTypeIdsOverride: [mat.id, reformer.id],
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      clientPackage: { id: string; classTypeIds: string[] };
    };
    expect([...body.clientPackage.classTypeIds].sort()).toEqual(
      [mat.id, reformer.id].sort(),
    );

    const snapshot = await prisma.clientPackageClassType.findMany({
      where: { clientPackageId: body.clientPackage.id },
      select: { classTypeId: true },
    });
    expect(snapshot.map((s) => s.classTypeId).sort()).toEqual(
      [mat.id, reformer.id].sort(),
    );

    const created = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: body.clientPackage.id },
      select: {
        id: true,
        startsAt: true,
        expiresAt: true,
        sessionsRemaining: true,
        revokedAt: true,
        classTypes: { select: { classTypeId: true } },
      },
    });
    const eligibilityPackage = {
      id: created.id,
      classTypeIds: created.classTypes.map((c) => c.classTypeId),
      startsAt: created.startsAt,
      expiresAt: created.expiresAt,
      sessionsRemaining: created.sessionsRemaining,
      revokedAt: created.revokedAt,
    };
    const at = now();
    expect(
      findEligibleClientPackage([eligibilityPackage], [], at, mat.id),
    ).not.toBeNull();
    expect(
      findEligibleClientPackage([eligibilityPackage], [], at, reformer.id),
    ).not.toBeNull();
  });
});

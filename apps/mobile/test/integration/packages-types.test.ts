import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET, POST } from "@/server/routes/packages/types";
import { PATCH, DELETE } from "@/server/routes/packages/types/[id]";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";
import { SYSTEM_BIRTHDAY_GIFT_ID } from "@/lib/server/system-gift";

async function seedAdminAndClassType() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return { admin, reformer };
}

function asAdmin(admin: { id: string; email: string }) {
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
}

function asClient() {
  setMockUser({
    id: "client-1",
    role: "CLIENT",
    email: "client@test.local",
    isActive: true,
    clientProfile: { id: "profile-1" },
  });
}

function jsonRequest(body: unknown) {
  return new Request("http://test.local/api/packages/types", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("packages/types CRUD", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("POST creates a package type linked to an existing class type (201)", async () => {
    const { admin, reformer } = await seedAdminAndClassType();
    asAdmin(admin);

    const response = await POST(
      jsonRequest({
        name: "Reformer 12-pack",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeIds: [reformer.id],
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      packageType: { id: string; classTypes: { id: string; name: string }[] };
    };
    expect(body.packageType.classTypes).toEqual([
      { id: reformer.id, name: "Reformer pilates" },
    ]);

    const persisted = await prisma.packageType.findUnique({
      where: { id: body.packageType.id },
    });
    expect(persisted?.name).toBe("Reformer 12-pack");
  });

  it("POST with multiple classTypeIds creates a mix package — join rows persisted, classTypes in response", async () => {
    const { admin, reformer } = await seedAdminAndClassType();
    const energy = await prisma.classType.create({
      data: { name: "Energy", maxClients: 8, durationMins: 45 },
    });
    asAdmin(admin);

    const response = await POST(
      jsonRequest({
        name: "Mix 12-pack",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeIds: [reformer.id, energy.id],
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      packageType: { id: string; classTypes: { id: string; name: string }[] };
    };
    expect(body.packageType.classTypes.map((ct) => ct.id).sort()).toEqual(
      [reformer.id, energy.id].sort(),
    );

    const joinRows = await prisma.packageTypeClassType.findMany({
      where: { packageTypeId: body.packageType.id },
    });
    expect(joinRows.map((r) => r.classTypeId).sort()).toEqual(
      [reformer.id, energy.id].sort(),
    );
  });

  it("PATCH replaces the covered set — narrowing a mix pack back to one type", async () => {
    const { admin, reformer } = await seedAdminAndClassType();
    const energy = await prisma.classType.create({
      data: { name: "Energy", maxClients: 8, durationMins: 45 },
    });
    asAdmin(admin);
    const created = await prisma.packageType.create({
      data: {
        name: "Mix 12-pack",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: {
          create: [{ classTypeId: reformer.id }, { classTypeId: energy.id }],
        },
      },
    });

    const response = await PATCH(
      new Request(`http://test.local/api/packages/types/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classTypeIds: [energy.id] }),
      }),
      { id: created.id },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      packageType: { classTypes: { id: string; name: string }[] };
    };
    expect(body.packageType.classTypes).toEqual([{ id: energy.id, name: "Energy" }]);

    const joinRows = await prisma.packageTypeClassType.findMany({
      where: { packageTypeId: created.id },
    });
    expect(joinRows.map((r) => r.classTypeId)).toEqual([energy.id]);
  });

  it("POST trims a padded name before persisting (the 'Energy ' incident)", async () => {
    // A PackageType named "Energy " (trailing space) was saved through the
    // admin catalog form on staging and later broke a name-based lookup. The
    // schema now trims at parse, so the route can never persist a padded name
    // regardless of what the client sends.
    const { admin, reformer } = await seedAdminAndClassType();
    asAdmin(admin);

    const response = await POST(
      jsonRequest({
        name: " Energy ",
        sessionCount: 10,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeIds: [reformer.id],
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { packageType: { id: string; name: string } };
    expect(body.packageType.name).toBe("Energy");

    const persisted = await prisma.packageType.findUnique({
      where: { id: body.packageType.id },
    });
    expect(persisted?.name).toBe("Energy");
  });

  it("POST persists isBirthdayGift=true and returns it in the response", async () => {
    const { admin, reformer } = await seedAdminAndClassType();
    asAdmin(admin);

    const response = await POST(
      jsonRequest({
        name: "Birthday gift",
        sessionCount: 1,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeIds: [reformer.id],
        isBirthdayGift: true,
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      packageType: { id: string; isBirthdayGift: boolean };
    };
    expect(body.packageType.isBirthdayGift).toBe(true);

    const persisted = await prisma.packageType.findUnique({
      where: { id: body.packageType.id },
    });
    expect(persisted?.isBirthdayGift).toBe(true);
  });

  it("POST returns 404 when classTypeIds references a non-existent ClassType", async () => {
    const { admin } = await seedAdminAndClassType();
    asAdmin(admin);

    const response = await POST(
      jsonRequest({
        name: "Phantom pack",
        sessionCount: 8,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeIds: ["00000000-0000-0000-0000-000000000000"],
      }),
    );
    expect(response.status).toBe(404);
    expect(await prisma.packageType.count()).toBe(0);
  });

  it("POST returns 403 for non-admin callers", async () => {
    const { reformer } = await seedAdminAndClassType();
    asClient();

    const response = await POST(
      jsonRequest({
        name: "Sneaky pack",
        sessionCount: 8,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeIds: [reformer.id],
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.packageType.count()).toBe(0);
  });

  it("PATCH updates editable fields on an existing package type", async () => {
    const { admin, reformer } = await seedAdminAndClassType();
    asAdmin(admin);
    const created = await prisma.packageType.create({
      data: {
        name: "Reformer 8-pack",
        sessionCount: 8,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: { create: { classTypeId: reformer.id } },
      },
    });

    const response = await PATCH(
      new Request(`http://test.local/api/packages/types/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionCount: 10, lateCancelHours: 24 }),
      }),
      { id: created.id },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      packageType: { id: string; isBirthdayGift: boolean };
    };
    expect(body.packageType.isBirthdayGift).toBe(false);
    const persisted = await prisma.packageType.findUnique({
      where: { id: created.id },
    });
    expect(persisted?.sessionCount).toBe(10);
    expect(persisted?.lateCancelHours).toBe(24);
  });

  it("PATCH returns 404 for an unknown package type id", async () => {
    const { admin } = await seedAdminAndClassType();
    asAdmin(admin);
    const response = await PATCH(
      new Request("http://test.local/api/packages/types/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionCount: 99 }),
      }),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(response.status).toBe(404);
  });

  it("DELETE succeeds when the package type has no dependent client packages", async () => {
    const { admin, reformer } = await seedAdminAndClassType();
    asAdmin(admin);
    const created = await prisma.packageType.create({
      data: {
        name: "Reformer 8-pack",
        sessionCount: 8,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: { create: { classTypeId: reformer.id } },
      },
    });
    const response = await DELETE(
      new Request(`http://test.local/api/packages/types/${created.id}`, {
        method: "DELETE",
      }),
      { id: created.id },
    );
    expect(response.status).toBe(200);
    expect(await prisma.packageType.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("DELETE returns 409 when an active ClientPackage references the type", async () => {
    const { admin, reformer } = await seedAdminAndClassType();
    asAdmin(admin);
    const packageType = await prisma.packageType.create({
      data: {
        name: "Reformer 12-pack",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: { create: { classTypeId: reformer.id } },
      },
    });
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Test", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: profile.id,
        packageTypeId: packageType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 12,
        startsAt: now(),
        expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
        sessionsRemaining: 12,
        sessionsGranted: 12,
      },
    });

    const response = await DELETE(
      new Request(`http://test.local/api/packages/types/${packageType.id}`, {
        method: "DELETE",
      }),
      { id: packageType.id },
    );
    expect(response.status).toBe(409);
    expect(await prisma.packageType.findUnique({ where: { id: packageType.id } })).not.toBeNull();
  });

  // ── Built-in system gift (§5) ──────────────────────────────────────────────

  function getRequest() {
    return new Request("http://test.local/api/packages/types", { method: "GET" });
  }

  it("GET ensures the built-in gift row — present exactly once after two calls", async () => {
    const { admin } = await seedAdminAndClassType();
    asAdmin(admin);

    await GET(getRequest());
    const second = await GET(getRequest());
    expect(second.status).toBe(200);
    const body = (await second.json()) as {
      packageTypes: {
        id: string;
        name: string;
        isSystem?: boolean;
        isBirthdayGift?: boolean;
        classTypes: unknown[];
      }[];
    };

    // Idempotent: two GETs, still exactly one system row in the DB…
    const rows = await prisma.packageType.findMany({
      where: { isSystem: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(SYSTEM_BIRTHDAY_GIFT_ID);
    expect(rows[0].name).toBe("🎂 Rođendanski poklon");
    expect(rows[0].sessionCount).toBe(1);
    expect(rows[0].validityDays).toBe(30);
    expect(rows[0].lateCancelHours).toBe(8);
    expect(rows[0].isBirthdayGift).toBe(true);
    expect(rows[0].price).toBeNull();

    // …and the response shape carries isSystem + isBirthdayGift, with no
    // covered class types (the assign-sheet override defines coverage).
    const gift = body.packageTypes.find((pt) => pt.id === SYSTEM_BIRTHDAY_GIFT_ID);
    expect(gift).toBeTruthy();
    expect(gift!.isSystem).toBe(true);
    expect(gift!.isBirthdayGift).toBe(true);
    expect(gift!.classTypes).toEqual([]);
  });

  it("PATCH on the system gift is rejected (409) and leaves it unchanged", async () => {
    const { admin } = await seedAdminAndClassType();
    asAdmin(admin);
    await GET(getRequest()); // ensure the row exists

    const response = await PATCH(
      new Request(`http://test.local/api/packages/types/${SYSTEM_BIRTHDAY_GIFT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Hacked gift" }),
      }),
      { id: SYSTEM_BIRTHDAY_GIFT_ID },
    );
    expect(response.status).toBe(409);
    const persisted = await prisma.packageType.findUnique({
      where: { id: SYSTEM_BIRTHDAY_GIFT_ID },
    });
    expect(persisted?.name).toBe("🎂 Rođendanski poklon");
  });

  it("DELETE on the system gift is rejected (409) and leaves it in place", async () => {
    const { admin } = await seedAdminAndClassType();
    asAdmin(admin);
    await GET(getRequest()); // ensure the row exists

    const response = await DELETE(
      new Request(`http://test.local/api/packages/types/${SYSTEM_BIRTHDAY_GIFT_ID}`, {
        method: "DELETE",
      }),
      { id: SYSTEM_BIRTHDAY_GIFT_ID },
    );
    expect(response.status).toBe(409);
    expect(
      await prisma.packageType.findUnique({ where: { id: SYSTEM_BIRTHDAY_GIFT_ID } }),
    ).not.toBeNull();
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { POST } from "@/server/routes/packages/types";
import { PATCH, DELETE } from "@/server/routes/packages/types/[id]";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";

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
        classTypeId: reformer.id,
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { packageType: { id: string; classTypeId: string } };
    expect(body.packageType.classTypeId).toBe(reformer.id);

    const persisted = await prisma.packageType.findUnique({
      where: { id: body.packageType.id },
    });
    expect(persisted?.name).toBe("Reformer 12-pack");
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
        classTypeId: reformer.id,
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
        classTypeId: reformer.id,
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

  it("POST returns 404 when classTypeId references a non-existent ClassType", async () => {
    const { admin } = await seedAdminAndClassType();
    asAdmin(admin);

    const response = await POST(
      jsonRequest({
        name: "Phantom pack",
        sessionCount: 8,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeId: "00000000-0000-0000-0000-000000000000",
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
        classTypeId: reformer.id,
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
        classTypeId: reformer.id,
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
        classTypeId: reformer.id,
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
        classTypeId: reformer.id,
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
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: now(),
        expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
        sessionsRemaining: 12,
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
});

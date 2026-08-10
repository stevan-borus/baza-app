import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { PATCH, DELETE } from "@/server/routes/trainings/class-types/[id]";
import { GET, POST } from "@/server/routes/trainings/class-types";
import { prisma } from "@/lib/server/prisma";

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

describe("class-types PATCH + DELETE", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("PATCH updates editable fields on an existing class type (admin)", async () => {
    const ct = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxClients: 8, durationMins: 75 }),
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.classType.findUnique({ where: { id: ct.id } });
    expect(reloaded?.maxClients).toBe(8);
    expect(reloaded?.durationMins).toBe(75);
  });

  it("PATCH returns 404 for an unknown class type id", async () => {
    asAdmin();
    const response = await PATCH(
      new Request("http://test.local/api/trainings/class-types/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxClients: 12 }),
      }),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(response.status).toBe(404);
  });

  it("DELETE succeeds when no PackageType or Session references the class type", async () => {
    const ct = await prisma.classType.create({
      data: { name: "Standalone", maxClients: 6, durationMins: 60 },
    });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "DELETE",
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(200);
    expect(await prisma.classType.findUnique({ where: { id: ct.id } })).toBeNull();
  });

  it("DELETE returns 409 when a PackageType references the class type", async () => {
    const ct = await prisma.classType.create({
      data: { name: "WithPack", maxClients: 6, durationMins: 60 },
    });
    await prisma.packageType.create({
      data: {
        name: "WithPack 12",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: { create: { classTypeId: ct.id } },
      },
    });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "DELETE",
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(409);
    expect(await prisma.classType.findUnique({ where: { id: ct.id } })).not.toBeNull();
  });

  it("DELETE returns 409 when a Session references the class type (even with no PackageType)", async () => {
    const ct = await prisma.classType.create({
      data: { name: "WithSession", maxClients: 6, durationMins: 60 },
    });
    const trainer = await prisma.user.create({
      data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    });
    await prisma.session.create({
      data: {
        classTypeId: ct.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-08-10T10:00:00Z"),
        endsAt: new Date("2026-08-10T11:00:00Z"),
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "DELETE",
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(409);
    expect(await prisma.classType.findUnique({ where: { id: ct.id } })).not.toBeNull();
  });

  it("DELETE returns 409 when only a ClientPackage SNAPSHOT references the class type", async () => {
    // A sold package snapshots its covered set; the SKU can later be narrowed
    // away from a type while sold packages still cover it. Deleting the type
    // must stay blocked as long as any snapshot references it — otherwise a
    // client would lose a covered type they paid for.
    const snapshotOnly = await prisma.classType.create({
      data: { name: "SnapshotOnly", maxClients: 6, durationMins: 60 },
    });
    const other = await prisma.classType.create({
      data: { name: "Other", maxClients: 6, durationMins: 60 },
    });
    // The SKU now covers only `other` — no PackageTypeClassType row for
    // `snapshotOnly`, and no Session either.
    const packageType = await prisma.packageType.create({
      data: {
        name: "Narrowed mix",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: { create: { classTypeId: other.id } },
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
        classTypes: {
          create: [{ classTypeId: snapshotOnly.id }, { classTypeId: other.id }],
        },
        lateCancelHours: 12,
        startsAt: new Date("2026-07-01T00:00:00Z"),
        expiresAt: new Date("2026-08-01T00:00:00Z"),
        sessionsRemaining: 12,
      },
    });

    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/trainings/class-types/${snapshotOnly.id}`, {
        method: "DELETE",
      }),
      { id: snapshotOnly.id },
    );
    expect(response.status).toBe(409);
    expect(
      await prisma.classType.findUnique({ where: { id: snapshotOnly.id } }),
    ).not.toBeNull();
  });
});

describe("class-types emptyBookingCutoffHours (admin config)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function postClassType(body: Record<string, unknown>) {
    return POST(
      new Request("http://test.local/api/trainings/class-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  it("POST without the field creates the class type with the 4h default and returns it", async () => {
    asAdmin();
    const response = await postClassType({
      name: "Default cutoff",
      maxClients: 6,
      durationMins: 60,
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.classType.emptyBookingCutoffHours).toBe(4);
    const reloaded = await prisma.classType.findUnique({
      where: { id: json.classType.id },
    });
    expect(reloaded?.emptyBookingCutoffHours).toBe(4);
  });

  it("POST with an explicit cutoff persists and returns it", async () => {
    asAdmin();
    const response = await postClassType({
      name: "Six hour cutoff",
      maxClients: 6,
      durationMins: 60,
      emptyBookingCutoffHours: 6,
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.classType.emptyBookingCutoffHours).toBe(6);
    const reloaded = await prisma.classType.findUnique({
      where: { id: json.classType.id },
    });
    expect(reloaded?.emptyBookingCutoffHours).toBe(6);
  });

  it("PATCH sets the cutoff to 0 (rule off) without touching the other fields", async () => {
    const ct = await prisma.classType.create({
      data: {
        name: "Turn it off",
        maxClients: 6,
        durationMins: 60,
        emptyBookingCutoffHours: 4,
      },
    });
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emptyBookingCutoffHours: 0 }),
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.classType.emptyBookingCutoffHours).toBe(0);
    const reloaded = await prisma.classType.findUnique({ where: { id: ct.id } });
    expect(reloaded?.emptyBookingCutoffHours).toBe(0);
    expect(reloaded?.name).toBe("Turn it off");
    expect(reloaded?.maxClients).toBe(6);
    expect(reloaded?.durationMins).toBe(60);
  });

  it("PATCH that omits the cutoff leaves the stored value alone (no default reset)", async () => {
    const ct = await prisma.classType.create({
      data: {
        name: "Keep my cutoff",
        maxClients: 6,
        durationMins: 60,
        emptyBookingCutoffHours: 9,
      },
    });
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxClients: 10 }),
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.classType.emptyBookingCutoffHours).toBe(9);
    const reloaded = await prisma.classType.findUnique({ where: { id: ct.id } });
    expect(reloaded?.emptyBookingCutoffHours).toBe(9);
    expect(reloaded?.maxClients).toBe(10);
  });

  it("GET list returns the cutoff for every class type", async () => {
    await prisma.classType.create({
      data: {
        name: "Listed",
        maxClients: 6,
        durationMins: 60,
        emptyBookingCutoffHours: 3,
      },
    });
    asAdmin();
    const response = await GET(
      new Request("http://test.local/api/trainings/class-types"),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    const listed = json.classTypes.find(
      (ct: { name: string }) => ct.name === "Listed",
    );
    expect(listed?.emptyBookingCutoffHours).toBe(3);
  });
});

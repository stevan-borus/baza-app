import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { PATCH, DELETE } from "@/server/routes/trainings/class-types/[id]";
import { POST as CREATE_CLASS_TYPE } from "@/server/routes/trainings/class-types";
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
        sessionsGranted: 12,
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

  it("POST then PATCH round-trips trialSessionValue between positive values", async () => {
    asAdmin();
    const created = await CREATE_CLASS_TYPE(
      new Request("http://test.local/api/trainings/class-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Probni Reformer",
          maxClients: 6,
          durationMins: 60,
          trialSessionValue: 2500,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.classType.trialSessionValue).toBe(2500);

    const id = createdBody.classType.id;
    const raised = await PATCH(
      new Request(`http://test.local/api/trainings/class-types/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trialSessionValue: 3000 }),
      }),
      { id },
    );
    expect(raised.status).toBe(200);
    expect((await raised.json()).classType.trialSessionValue).toBe(3000);
    expect(
      (await prisma.classType.findUnique({ where: { id } }))?.trialSessionValue,
    ).toBe(3000);
  });

  it("PATCH rejects clearing trialSessionValue back to null", async () => {
    asAdmin();
    const created = await CREATE_CLASS_TYPE(
      new Request("http://test.local/api/trainings/class-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Ne moze bez vrednosti",
          maxClients: 6,
          durationMins: 60,
          trialSessionValue: 2500,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const id = (await created.json()).classType.id;

    // A valued type can never go back to unvalued: an unvalued type silently
    // drops confirmed trials out of the trainer payout, so the only way back
    // is a deliberate DB backfill, not a PATCH.
    const cleared = await PATCH(
      new Request(`http://test.local/api/trainings/class-types/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trialSessionValue: null }),
      }),
      { id },
    );
    expect(cleared.status).toBe(400);
    expect(
      (await prisma.classType.findUnique({ where: { id } }))?.trialSessionValue,
    ).toBe(2500);
  });

  it("PATCH may omit trialSessionValue and leaves the stored value untouched", async () => {
    asAdmin();
    const created = await CREATE_CLASS_TYPE(
      new Request("http://test.local/api/trainings/class-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Samo preimenovanje",
          maxClients: 6,
          durationMins: 60,
          trialSessionValue: 1800,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const id = (await created.json()).classType.id;

    const renamed = await PATCH(
      new Request(`http://test.local/api/trainings/class-types/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Preimenovan" }),
      }),
      { id },
    );
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).classType.trialSessionValue).toBe(1800);
  });

  it("POST rejects a class type created without trialSessionValue", async () => {
    asAdmin();
    const created = await CREATE_CLASS_TYPE(
      new Request("http://test.local/api/trainings/class-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Bez probnog",
          maxClients: 6,
          durationMins: 60,
        }),
      }),
    );
    expect(created.status).toBe(400);
    expect(
      await prisma.classType.findFirst({ where: { name: "Bez probnog" } }),
    ).toBeNull();
  });

  it("POST rejects an explicitly null trialSessionValue", async () => {
    asAdmin();
    const created = await CREATE_CLASS_TYPE(
      new Request("http://test.local/api/trainings/class-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Izricito null",
          maxClients: 6,
          durationMins: 60,
          trialSessionValue: null,
        }),
      }),
    );
    expect(created.status).toBe(400);
    expect(
      await prisma.classType.findFirst({ where: { name: "Izricito null" } }),
    ).toBeNull();
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET, PATCH } from "@/server/routes/clients/[id]";
import { prisma } from "@/lib/server/prisma";

function patchRequest(body: unknown) {
  return new Request("http://test.local/api/clients/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedAdminAndClient() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  setMockUser({
    id: admin.id, role: "ADMIN", email: admin.email, isActive: true,
    clientProfile: null,
  });
  const clientUser = await prisma.user.create({
    data: {
      email: "client@test.local",
      firstName: "Client",
      lastName: "X",
      role: "CLIENT",
      clientProfile: { create: { dateOfBirth: new Date("1990-05-14T00:00:00.000Z") } },
    },
    select: { id: true, clientProfile: { select: { id: true } } },
  });
  return { admin, clientUserId: clientUser.id, clientProfileId: clientUser.clientProfile!.id };
}

describe("clients/[id] API — dateOfBirth", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("GET returns dateOfBirth as an ISO date string", async () => {
    const { clientUserId } = await seedAdminAndClient();
    const res = await GET(new Request("http://test.local"), { id: clientUserId });
    const json = (await res.json()) as { client: { dateOfBirth: string | null } };
    expect(res.status).toBe(200);
    expect(json.client.dateOfBirth).toBe("1990-05-14");
  });

  it("PATCH sets dateOfBirth from a YYYY-MM-DD string", async () => {
    const { clientUserId, clientProfileId } = await seedAdminAndClient();
    const res = await PATCH(patchRequest({ dateOfBirth: "1985-12-25" }), { id: clientUserId });
    expect(res.status).toBe(200);
    const profile = await prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: { dateOfBirth: true },
    });
    expect(profile!.dateOfBirth!.toISOString().slice(0, 10)).toBe("1985-12-25");
  });

  it("PATCH clears dateOfBirth when given null", async () => {
    const { clientUserId, clientProfileId } = await seedAdminAndClient();
    const res = await PATCH(patchRequest({ dateOfBirth: null }), { id: clientUserId });
    expect(res.status).toBe(200);
    const profile = await prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: { dateOfBirth: true },
    });
    expect(profile!.dateOfBirth).toBeNull();
  });

  it("PATCH rejects an invalid dateOfBirth", async () => {
    const { clientUserId } = await seedAdminAndClient();
    const res = await PATCH(patchRequest({ dateOfBirth: "1990-13-40" }), { id: clientUserId });
    expect(res.status).toBe(400);
  });

  it("Trainer PATCH on dateOfBirth returns 403", async () => {
    const { clientUserId, clientProfileId } = await seedAdminAndClient();
    // Replace mock with a trainer linked to this client.
    const trainer = await prisma.user.create({
      data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    });
    setMockUser({
      id: trainer.id, role: "TRAINER", email: trainer.email, isActive: true,
      clientProfile: null,
    });
    const res = await PATCH(patchRequest({ dateOfBirth: "1990-05-14" }), { id: clientUserId });
    expect(res.status).toBe(403);
    // DOB unchanged.
    const profile = await prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: { dateOfBirth: true },
    });
    expect(profile!.dateOfBirth!.toISOString().slice(0, 10)).toBe("1990-05-14");
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/admin/clients/[id]/health";
import { prisma } from "@/lib/server/prisma";

/**
 * BOLA regression: GET /api/admin/clients/[id]/health returns a client's full
 * medical intake. A TRAINER may only read the health record of a client they
 * are linked to via an active booking; an unlinked trainer must get 403.
 * ADMIN is unrestricted.
 */
async function seed() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const trainerLinked = await prisma.user.create({
    data: { email: "linked@test.local", firstName: "Linked", lastName: "Trainer", role: "TRAINER" },
  });
  const trainerUnlinked = await prisma.user.create({
    data: { email: "unlinked@test.local", firstName: "Unlinked", lastName: "Trainer", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: {
      email: "patient@test.local",
      firstName: "Patient",
      lastName: "Zero",
      role: "CLIENT",
      clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
    },
    include: { clientProfile: true },
  });
  const clientProfileId = client.clientProfile!.id;

  // A recorded intake so a successful read has something to return.
  await prisma.clientHealthIntake.create({
    data: {
      clientProfileId,
      conditions: [],
      underMedicalTreatment: false,
      pilatesExperience: ["none"],
      activityLevel: "moderate",
      exerciseFrequency: "2-3",
      goals: [],
      discomfortDuring: [],
    },
  });

  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  // Active booking that links ONLY trainerLinked to this client.
  const session = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      trainerUserId: trainerLinked.id,
      startsAt: new Date("2026-06-15T10:00:00Z"),
      endsAt: new Date("2026-06-15T11:00:00Z"),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
  await prisma.booking.create({
    data: { sessionId: session.id, clientProfileId },
  });

  return { admin, trainerLinked, trainerUnlinked, client };
}

function req(clientUserId: string) {
  return new Request(
    `http://test.local/api/admin/clients/${clientUserId}/health`,
  );
}

function asAdmin(u: { id: string; email: string }) {
  setMockUser({ id: u.id, role: "ADMIN", email: u.email, isActive: true, clientProfile: null });
}
function asTrainer(u: { id: string; email: string }) {
  setMockUser({ id: u.id, role: "TRAINER", email: u.email, isActive: true, clientProfile: null });
}

describe("GET /api/admin/clients/[id]/health — trainer linkage", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("forbids a TRAINER not linked to the client (403)", async () => {
    const { trainerUnlinked, client } = await seed();
    asTrainer(trainerUnlinked);
    const res = await GET(req(client.id));
    expect(res.status).toBe(403);
  });

  it("allows a TRAINER linked via an active booking (200)", async () => {
    const { trainerLinked, client } = await seed();
    asTrainer(trainerLinked);
    const res = await GET(req(client.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("allows ADMIN unconditionally (200)", async () => {
    const { admin, client } = await seed();
    asAdmin(admin);
    const res = await GET(req(client.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

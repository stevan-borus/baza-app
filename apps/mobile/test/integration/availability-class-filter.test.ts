import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/app/api/sessions/availability/+api";
import { prisma } from "@/lib/server/prisma";

async function baseFixtures() {
  const trainer = await prisma.user.create({
    data: { email: "tr@test.local", firstName: "T", lastName: "Trainer", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const energy = await prisma.classType.create({
    data: { name: "Energy pilates", maxClients: 12, durationMins: 60 },
  });
  return { trainer, client, clientProfile, reformer, energy };
}

async function makeSession(classTypeId: string, trainerUserId: string, startsAt: Date) {
  return prisma.session.create({
    data: {
      classTypeId,
      trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function makePackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  sessionsRemaining?: number;
  startsAt?: Date;
  expiresAt?: Date;
}) {
  const packageType = await prisma.packageType.create({
    data: {
      name: `pt-${Math.random()}`,
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: opts.classTypeId,
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypeId: opts.classTypeId,
      lateCancelHours: 12,
      startsAt: opts.startsAt ?? new Date("2026-05-01T00:00:00Z"),
      expiresAt: opts.expiresAt ?? new Date("2026-12-01T00:00:00Z"),
      sessionsRemaining: opts.sessionsRemaining ?? 12,
    },
  });
}

function buildRequest(month: string) {
  return new Request(
    `http://test.local/api/sessions/availability?month=${encodeURIComponent(month)}`,
  );
}

const MONTH = "2026-06";
const SESSION_DATE = new Date("2026-06-15T10:00:00Z");

describe("GET /api/sessions/availability class-scoped client filtering", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns empty array when client has no packs at all", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await GET(buildRequest(MONTH));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toEqual([]);
  });

  it("hides sessions from class types the client has no pack for", async () => {
    const { client, clientProfile, trainer, reformer, energy } =
      await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);
    const energySession = await makeSession(energy.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: energy.id,
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions.map((s: { id: string }) => s.id)).toEqual([
      energySession.id,
    ]);
  });

  it("hides sessions when the matching pack has 0 sessions remaining", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 0,
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toEqual([]);
  });

  it("hides sessions whose startsAt falls after the matching pack expires", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-05-30T00:00:00Z"),
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toEqual([]);
  });

  it("hides sessions before a future-dated pack startsAt", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      startsAt: new Date("2026-07-01T00:00:00Z"),
      expiresAt: new Date("2026-08-01T00:00:00Z"),
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toEqual([]);
  });

  it("hides sessions inside a pause window even if the pack matches the class", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
    });
    await prisma.packagePause.create({
      data: {
        clientProfileId: clientProfile.id,
        startsAt: new Date("2026-06-10T00:00:00Z"),
        endsAt: new Date("2026-06-20T00:00:00Z"),
      },
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toEqual([]);
  });

  it("admins see everything regardless of pack scope", async () => {
    const adminUser = await prisma.user.create({
      data: { email: "a@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
    });
    const { trainer, reformer, energy } = await baseFixtures();
    await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makeSession(energy.id, trainer.id, SESSION_DATE);

    setMockUser({
      id: adminUser.id,
      role: "ADMIN",
      email: adminUser.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(2);
  });
});

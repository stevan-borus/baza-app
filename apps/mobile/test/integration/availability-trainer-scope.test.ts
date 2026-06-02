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

import { GET } from "@/app/api/sessions/availability/+api";
import { prisma } from "@/lib/server/prisma";

async function seed() {
  const trainerA = await prisma.user.create({
    data: { email: "ta@test.local", firstName: "Trainer", lastName: "A", role: "TRAINER" },
  });
  const trainerB = await prisma.user.create({
    data: { email: "tb@test.local", firstName: "Trainer", lastName: "B", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  // Two sessions in 2026-08, one per trainer.
  const sessionA = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      trainerUserId: trainerA.id,
      startsAt: new Date("2026-08-10T10:00:00Z"),
      endsAt: new Date("2026-08-10T11:00:00Z"),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
  const sessionB = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      trainerUserId: trainerB.id,
      startsAt: new Date("2026-08-12T10:00:00Z"),
      endsAt: new Date("2026-08-12T11:00:00Z"),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
  return { trainerA, trainerB, sessionA, sessionB };
}

function asTrainer(t: { id: string; email: string }) {
  setMockUser({
    id: t.id,
    role: "TRAINER",
    email: t.email,
    isActive: true,
    clientProfile: null,
  });
}

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function buildRequest(month: string) {
  return new Request(
    `http://test.local/api/sessions/availability?month=${month}`,
    { method: "GET" },
  );
}

describe("GET /api/sessions/availability — trainer + visibility scope", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("trainer sees only their own assigned sessions", async () => {
    const { trainerA, sessionA } = await seed();
    asTrainer(trainerA);

    const response = await GET(buildRequest("2026-08"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { sessions: { id: string }[] };
    const ids = body.sessions.map((s) => s.id);
    expect(ids).toEqual([sessionA.id]);
  });

  it("each trainer sees a different slice; trainer A's session is invisible to trainer B", async () => {
    const { trainerB, sessionB } = await seed();
    asTrainer(trainerB);

    const response = await GET(buildRequest("2026-08"));
    const body = (await response.json()) as { sessions: { id: string }[] };
    const ids = body.sessions.map((s) => s.id);
    expect(ids).toEqual([sessionB.id]);
  });

  it("admin sees both trainers' sessions in the same month", async () => {
    const { sessionA, sessionB } = await seed();
    asAdmin();

    const response = await GET(buildRequest("2026-08"));
    const body = (await response.json()) as { sessions: { id: string }[] };
    expect(new Set(body.sessions.map((s) => s.id))).toEqual(
      new Set([sessionA.id, sessionB.id]),
    );
  });

  it("non-admin callers do not see deactivated standalone sessions", async () => {
    const { trainerA } = await seed();
    // Add a deactivated standalone session for trainer A.
    const reformer = await prisma.classType.findFirstOrThrow();
    const hidden = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        startsAt: new Date("2026-08-15T10:00:00Z"),
        endsAt: new Date("2026-08-15T11:00:00Z"),
        capacity: 6,
        isActive: false,
        status: "SCHEDULED",
      },
    });

    asTrainer(trainerA);
    const response = await GET(buildRequest("2026-08"));
    const body = (await response.json()) as { sessions: { id: string }[] };
    expect(body.sessions.map((s) => s.id)).not.toContain(hidden.id);

    // Admin still sees it.
    asAdmin();
    const adminResponse = await GET(buildRequest("2026-08"));
    const adminBody = (await adminResponse.json()) as { sessions: { id: string }[] };
    expect(adminBody.sessions.map((s) => s.id)).toContain(hidden.id);
  });
});

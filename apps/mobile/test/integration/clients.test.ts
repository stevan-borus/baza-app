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

import { GET, POST } from "@/app/api/clients/+api";
import { PATCH } from "@/app/api/clients/[id]/+api";
import { prisma } from "@/lib/server/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeClient(opts: { email: string; fullName: string }) {
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      fullName: opts.fullName,
      role: "CLIENT",
      isActive: true,
    },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id },
  });
  return { user, profile };
}

async function makeReformerPackageType() {
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12-pack",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  return { reformer, packageType };
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

function asTrainer(id: string) {
  setMockUser({
    id,
    role: "TRAINER",
    email: "trainer@test.local",
    isActive: true,
    clientProfile: null,
  });
}

describe("clients API", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("GET as admin lists clients with computed packageStatus reflecting their packages", async () => {
    const { reformer, packageType } = await makeReformerPackageType();
    const active = await makeClient({
      email: "active@test.local",
      fullName: "Active Annie",
    });
    const expired = await makeClient({
      email: "expired@test.local",
      fullName: "Expired Eric",
    });
    const empty = await makeClient({
      email: "empty@test.local",
      fullName: "Empty Emma",
    });

    await prisma.clientPackage.create({
      data: {
        clientProfileId: active.profile.id,
        packageTypeId: packageType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: new Date(Date.now() - 5 * DAY_MS),
        expiresAt: new Date(Date.now() + 25 * DAY_MS),
        sessionsRemaining: 8,
      },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: expired.profile.id,
        packageTypeId: packageType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: new Date(Date.now() - 60 * DAY_MS),
        expiresAt: new Date(Date.now() - 7 * DAY_MS),
        sessionsRemaining: 4,
      },
    });

    asAdmin();
    const response = await GET(new Request("http://test.local/api/clients"));
    const body = (await response.json()) as {
      clients: { user: { email: string }; packageStatus: string }[];
    };
    const byEmail = Object.fromEntries(
      body.clients.map((c) => [c.user.email, c.packageStatus]),
    );
    expect(byEmail["active@test.local"]).toBe("active");
    expect(byEmail["expired@test.local"]).toBe("expired");
    expect(byEmail["empty@test.local"]).toBe("none");
  });

  it("GET as trainer lists only clients linked via active booking", async () => {
    const { reformer } = await makeReformerPackageType();
    const trainer = await prisma.user.create({
      data: { email: "tx@test.local", fullName: "TX", role: "TRAINER" },
    });
    const linked = await makeClient({
      email: "linked@test.local",
      fullName: "Linked",
    });
    const stranger = await makeClient({
      email: "stranger@test.local",
      fullName: "Stranger",
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(Date.now() + DAY_MS),
        endsAt: new Date(Date.now() + DAY_MS + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: linked.profile.id },
    });

    asTrainer(trainer.id);
    const response = await GET(new Request("http://test.local/api/clients"));
    const body = (await response.json()) as {
      clients: { user: { email: string } }[];
    };
    expect(body.clients.map((c) => c.user.email)).toEqual(["linked@test.local"]);
    expect(body.clients.map((c) => c.user.email)).not.toContain(
      "stranger@test.local",
    );
  });

  it("POST creates a client user + clientProfile (admin-only)", async () => {
    asAdmin();
    const response = await POST(
      new Request("http://test.local/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "fresh@test.local",
          fullName: "Fresh Client",
        }),
      }),
    );
    expect(response.status).toBe(201);
    const persisted = await prisma.user.findUnique({
      where: { email: "fresh@test.local" },
      include: { clientProfile: true },
    });
    expect(persisted?.role).toBe("CLIENT");
    expect(persisted?.clientProfile).not.toBeNull();
  });

  it("PATCH as admin can deactivate a client (isActive=false)", async () => {
    const { user } = await makeClient({
      email: "deact@test.local",
      fullName: "Deact",
    });
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/clients/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { id: user.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded?.isActive).toBe(false);
  });

  it("PATCH as admin can reactivate a client (isActive=true)", async () => {
    const { user } = await makeClient({
      email: "react@test.local",
      fullName: "Reactivate",
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/clients/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      }),
      { id: user.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded?.isActive).toBe(true);
  });

  it("PATCH returns 404 for an unknown client id", async () => {
    asAdmin();
    const response = await PATCH(
      new Request("http://test.local/api/clients/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(response.status).toBe(404);
  });

  it("PATCH as trainer trying to set isActive on a linked client is rejected (admin-only field)", async () => {
    const { reformer } = await makeReformerPackageType();
    const trainer = await prisma.user.create({
      data: { email: "ty@test.local", fullName: "TY", role: "TRAINER" },
    });
    const linked = await makeClient({
      email: "linked2@test.local",
      fullName: "Linked2",
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(Date.now() + DAY_MS),
        endsAt: new Date(Date.now() + DAY_MS + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: linked.profile.id },
    });

    asTrainer(trainer.id);
    const response = await PATCH(
      new Request(`http://test.local/api/clients/${linked.user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { id: linked.user.id },
    );
    expect(response.status).toBe(403);
    const reloaded = await prisma.user.findUnique({
      where: { id: linked.user.id },
    });
    expect(reloaded?.isActive).toBe(true);
  });

  it("PATCH as trainer for a non-linked client is forbidden", async () => {
    const trainer = await prisma.user.create({
      data: { email: "tz@test.local", fullName: "TZ", role: "TRAINER" },
    });
    const stranger = await makeClient({
      email: "no-link@test.local",
      fullName: "NoLink",
    });

    asTrainer(trainer.id);
    const response = await PATCH(
      new Request(`http://test.local/api/clients/${stranger.user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: "some note" }),
      }),
      { id: stranger.user.id },
    );
    expect(response.status).toBe(403);
  });

  it("PATCH as trainer can update notes on a linked client", async () => {
    const { reformer } = await makeReformerPackageType();
    const trainer = await prisma.user.create({
      data: { email: "tw@test.local", fullName: "TW", role: "TRAINER" },
    });
    const linked = await makeClient({
      email: "linked3@test.local",
      fullName: "Linked3",
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(Date.now() + DAY_MS),
        endsAt: new Date(Date.now() + DAY_MS + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: linked.profile.id },
    });

    asTrainer(trainer.id);
    const response = await PATCH(
      new Request(`http://test.local/api/clients/${linked.user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: "Prefers afternoon classes" }),
      }),
      { id: linked.user.id },
    );
    expect(response.status).toBe(200);
    const reloadedProfile = await prisma.clientProfile.findUnique({
      where: { id: linked.profile.id },
    });
    expect(reloadedProfile?.notes).toBe("Prefers afternoon classes");
  });
});

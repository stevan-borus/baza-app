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
import { GET as GET_BY_ID, PATCH } from "@/app/api/clients/[id]/+api";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeClient(opts: { email: string; fullName: string }) {
  const [firstName, ...rest] = opts.fullName.split(" ");
  const lastName = rest.join(" ") || "Test";
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      firstName,
      lastName,
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
    void empty;

    await prisma.clientPackage.create({
      data: {
        clientProfileId: active.profile.id,
        packageTypeId: packageType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: new Date(nowMs() - 5 * DAY_MS),
        expiresAt: new Date(nowMs() + 25 * DAY_MS),
        sessionsRemaining: 8,
      },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: expired.profile.id,
        packageTypeId: packageType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: new Date(nowMs() - 60 * DAY_MS),
        expiresAt: new Date(nowMs() - 7 * DAY_MS),
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
      data: { email: "tx@test.local", firstName: "Trainer", lastName: "X", role: "TRAINER" },
    });
    const linked = await makeClient({
      email: "linked@test.local",
      fullName: "Linked",
    });
    const stranger = await makeClient({
      email: "stranger@test.local",
      fullName: "Stranger",
    });
    void stranger;
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + DAY_MS),
        endsAt: new Date(nowMs() + DAY_MS + 60 * 60 * 1000),
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
          firstName: "Fresh",
          lastName: "Client",
          dateOfBirth: "1990-01-01",
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
      data: { email: "ty@test.local", firstName: "Trainer", lastName: "Y", role: "TRAINER" },
    });
    const linked = await makeClient({
      email: "linked2@test.local",
      fullName: "Linked2",
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + DAY_MS),
        endsAt: new Date(nowMs() + DAY_MS + 60 * 60 * 1000),
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
      data: { email: "tz@test.local", firstName: "Trainer", lastName: "Z", role: "TRAINER" },
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
      data: { email: "tw@test.local", firstName: "Trainer", lastName: "W", role: "TRAINER" },
    });
    const linked = await makeClient({
      email: "linked3@test.local",
      fullName: "Linked3",
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + DAY_MS),
        endsAt: new Date(nowMs() + DAY_MS + 60 * 60 * 1000),
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

describe("GET /api/clients/[id]", () => {
  async function seedForGet() {
    const admin = await prisma.user.create({
      data: { email: "admin-get@test.local", firstName: "Admin", lastName: "Get", role: "ADMIN" },
    });
    const trainerLinked = await prisma.user.create({
      data: { email: "trainer-linked@test.local", firstName: "Linked", lastName: "Trainer", role: "TRAINER" },
    });
    const trainerOther = await prisma.user.create({
      data: { email: "trainer-other@test.local", firstName: "Other", lastName: "Trainer", role: "TRAINER" },
    });
    const clientUser = await prisma.user.create({
      data: { email: "client-get@test.local", firstName: "The", lastName: "Client", role: "CLIENT" },
    });
    const clientProfile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, notes: "Has tight hamstrings" },
    });
    const classType = await prisma.classType.create({
      data: { name: "Reformer Get", maxClients: 6, durationMins: 60 },
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainerLinked.id,
        startsAt: new Date(nowMs() - DAY_MS),
        endsAt: new Date(nowMs() - DAY_MS + 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });

    return { admin, trainerLinked, trainerOther, clientUser, clientProfile };
  }

  function buildRequest(id: string) {
    return new Request(`http://test.local/api/clients/${id}`);
  }

  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns 200 with client data when caller is admin", async () => {
    const { admin, clientUser, clientProfile } = await seedForGet();
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET_BY_ID(buildRequest(clientUser.id), { id: clientUser.id });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.client.id).toBe(clientProfile.id);
    expect(json.client.user.id).toBe(clientUser.id);
    expect(json.client.user.email).toBe("client-get@test.local");
    expect(json.client.notes).toBe("Has tight hamstrings");
  });

  it("returns 200 when trainer is linked to the client via active booking", async () => {
    const { trainerLinked, clientUser } = await seedForGet();
    setMockUser({
      id: trainerLinked.id,
      role: "TRAINER",
      email: trainerLinked.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET_BY_ID(buildRequest(clientUser.id), { id: clientUser.id });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.client.user.id).toBe(clientUser.id);
  });

  it("returns 403 when trainer is not linked to the client", async () => {
    const { trainerOther, clientUser } = await seedForGet();
    setMockUser({
      id: trainerOther.id,
      role: "TRAINER",
      email: trainerOther.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET_BY_ID(buildRequest(clientUser.id), { id: clientUser.id });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.client).toBeUndefined();
  });

  it("returns 403 when caller is a client", async () => {
    const { clientUser, clientProfile } = await seedForGet();
    setMockUser({
      id: clientUser.id,
      role: "CLIENT",
      email: clientUser.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await GET_BY_ID(buildRequest(clientUser.id), { id: clientUser.id });
    expect(res.status).toBe(403);
  });

  it("returns 404 when target client does not exist", async () => {
    const { admin } = await seedForGet();
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET_BY_ID(
      buildRequest("00000000-0000-0000-0000-000000000000"),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(res.status).toBe(404);
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET, POST } from "@/server/routes/packages/client-packages";
import { POST as POST_PAUSE } from "@/server/routes/packages/pause";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";
import { computePackageExpiresAt } from "@/lib/package-expiry";

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedReformerWithPackageType(opts?: { lateCancelHours?: number }) {
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12-pack",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: opts?.lateCancelHours ?? 12,
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  return { reformer, packageType };
}

async function makeClient(email: string) {
  const [firstName, ...rest] = email.split(" ");
  const lastName = rest.join(" ") || "Test";
  const user = await prisma.user.create({
    data: { email, firstName, lastName, role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id },
  });
  return { user, profile };
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

function asClient(c: { id: string; email: string; profileId: string }) {
  setMockUser({
    id: c.id,
    role: "CLIENT",
    email: c.email,
    isActive: true,
    clientProfile: { id: c.profileId },
  });
}

describe("packages/client-packages", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("POST snapshots sessionCount, validityDays, lateCancelHours, and classTypeId from PackageType", async () => {
    const { reformer, packageType } = await seedReformerWithPackageType({
      lateCancelHours: 24,
    });
    const client = await makeClient("snap@test.local");
    asAdmin();

    const startsAt = new Date("2026-08-01T00:00:00Z");
    const response = await POST(
      new Request("http://test.local/api/packages/client-packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientProfileId: client.profile.id,
          packageTypeId: packageType.id,
          startsAt: startsAt.toISOString(),
        }),
      }),
    );
    expect(response.status).toBe(201);

    const persisted = await prisma.clientPackage.findFirstOrThrow({
      where: { clientProfileId: client.profile.id },
      include: { classTypes: true },
    });
    expect(persisted.sessionsRemaining).toBe(12);
    expect(persisted.lateCancelHours).toBe(24);
    expect(persisted.classTypes.map((l) => l.classTypeId)).toEqual([reformer.id]);
    // Expiry is end-of-studio-day on the last valid day, not startsAt + N*24h
    // — asserted through the same helper the route uses so this can't drift
    // back to duration math. (The rule itself is unit-tested in
    // test/unit/package-expiry.test.ts.)
    expect(persisted.expiresAt.getTime()).toBe(
      computePackageExpiresAt(startsAt, 30).getTime(),
    );
  });

  it("POST returns 404 when the packageTypeId is unknown (no orphan ClientPackage created)", async () => {
    const client = await makeClient("orphan@test.local");
    asAdmin();
    const response = await POST(
      new Request("http://test.local/api/packages/client-packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientProfileId: client.profile.id,
          packageTypeId: "00000000-0000-0000-0000-000000000000",
          startsAt: now().toISOString(),
        }),
      }),
    );
    expect(response.status).toBe(404);
    expect(await prisma.clientPackage.count()).toBe(0);
  });

  it("POST as trainer assigning a pack to a non-linked client is rejected (403)", async () => {
    const { packageType } = await seedReformerWithPackageType();
    const trainer = await prisma.user.create({
      data: { email: "tr@test.local", firstName: "Tr", lastName: "Test", role: "TRAINER" },
    });
    const stranger = await makeClient("stranger@test.local");
    asTrainer(trainer.id);

    const response = await POST(
      new Request("http://test.local/api/packages/client-packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientProfileId: stranger.profile.id,
          packageTypeId: packageType.id,
          startsAt: now().toISOString(),
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.clientPackage.count()).toBe(0);
  });

  it("GET as client returns only their own packages and computes activePackageId", async () => {
    const { reformer, packageType } = await seedReformerWithPackageType();
    const me = await makeClient("me@test.local");
    const other = await makeClient("other@test.local");

    const myPack = await prisma.clientPackage.create({
      data: {
        clientProfileId: me.profile.id,
        packageTypeId: packageType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 12,
        startsAt: new Date(nowMs() - 5 * DAY_MS),
        expiresAt: new Date(nowMs() + 25 * DAY_MS),
        sessionsRemaining: 8,
      },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: other.profile.id,
        packageTypeId: packageType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 12,
        startsAt: new Date(nowMs() - 5 * DAY_MS),
        expiresAt: new Date(nowMs() + 25 * DAY_MS),
        sessionsRemaining: 8,
      },
    });

    asClient({ id: me.user.id, email: me.user.email, profileId: me.profile.id });
    const response = await GET(
      new Request("http://test.local/api/packages/client-packages"),
    );
    const body = (await response.json()) as {
      packages: { id: string }[];
      activePackageId: string | null;
    };
    expect(body.packages.map((p) => p.id)).toEqual([myPack.id]);
    expect(body.activePackageId).toBe(myPack.id);
  });

  it("GET as trainer for a non-linked client is forbidden", async () => {
    const trainer = await prisma.user.create({
      data: { email: "tr2@test.local", firstName: "Tr2", lastName: "Test", role: "TRAINER" },
    });
    const stranger = await makeClient("nolink@test.local");
    asTrainer(trainer.id);

    const response = await GET(
      new Request(
        `http://test.local/api/packages/client-packages?clientProfileId=${stranger.profile.id}`,
      ),
    );
    expect(response.status).toBe(403);
  });

  it("GET as admin without clientProfileId returns every client package", async () => {
    const { reformer, packageType } = await seedReformerWithPackageType();
    const a = await makeClient("a@test.local");
    const b = await makeClient("b@test.local");
    await prisma.clientPackage.create({
      data: {
        clientProfileId: a.profile.id,
        packageTypeId: packageType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 12,
        startsAt: now(),
        expiresAt: new Date(nowMs() + 30 * DAY_MS),
        sessionsRemaining: 12,
      },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: b.profile.id,
        packageTypeId: packageType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 12,
        startsAt: now(),
        expiresAt: new Date(nowMs() + 30 * DAY_MS),
        sessionsRemaining: 12,
      },
    });

    asAdmin();
    const response = await GET(
      new Request("http://test.local/api/packages/client-packages"),
    );
    const body = (await response.json()) as { packages: { id: string }[] };
    expect(body.packages).toHaveLength(2);
  });

  describe("packages/pause", () => {
    it("POST creates a pause window for a client", async () => {
      const client = await makeClient("pause@test.local");
      asAdmin();
      const response = await POST_PAUSE(
        new Request("http://test.local/api/packages/pause", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientProfileId: client.profile.id,
            startsAt: now().toISOString(),
            endsAt: new Date(nowMs() + 14 * DAY_MS).toISOString(),
            reason: "Vacation",
          }),
        }),
      );
      expect(response.status).toBe(201);
      const persisted = await prisma.packagePause.findFirst({
        where: { clientProfileId: client.profile.id },
      });
      expect(persisted?.reason).toBe("Vacation");
    });

    it("POST returns 400 when endsAt is not after startsAt", async () => {
      const client = await makeClient("invalid@test.local");
      asAdmin();
      const currentInstant = now();
      const response = await POST_PAUSE(
        new Request("http://test.local/api/packages/pause", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientProfileId: client.profile.id,
            startsAt: currentInstant.toISOString(),
            endsAt: currentInstant.toISOString(),
          }),
        }),
      );
      expect(response.status).toBe(400);
      expect(await prisma.packagePause.count()).toBe(0);
    });

    it("POST as trainer pausing a non-linked client is rejected (403)", async () => {
      const trainer = await prisma.user.create({
        data: { email: "tr3@test.local", firstName: "Tr3", lastName: "Test", role: "TRAINER" },
      });
      const stranger = await makeClient("nl@test.local");
      asTrainer(trainer.id);

      const response = await POST_PAUSE(
        new Request("http://test.local/api/packages/pause", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientProfileId: stranger.profile.id,
            startsAt: now().toISOString(),
            endsAt: new Date(nowMs() + DAY_MS).toISOString(),
          }),
        }),
      );
      expect(response.status).toBe(403);
      expect(await prisma.packagePause.count()).toBe(0);
    });
  });
});

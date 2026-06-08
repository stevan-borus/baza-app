import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";
import {
  countCampaignAudience,
  resolveCampaignAudience,
} from "@/lib/server/campaign-audience";

const DAY = 24 * 60 * 60 * 1000;

async function seedMatrix() {
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const energy = await prisma.classType.create({
    data: { name: "Energy", maxClients: 10, durationMins: 60 },
  });
  const reformerPt = await prisma.packageType.create({
    data: {
      name: "Reformer 12-pack",
      sessionCount: 12,
      validityDays: 30,
      classTypeId: reformer.id,
    },
  });
  const energyPt = await prisma.packageType.create({
    data: {
      name: "Energy 12-pack",
      sessionCount: 12,
      validityDays: 30,
      classTypeId: energy.id,
    },
  });
  const current = now().getTime();

  async function client(email: string) {
    const user = await prisma.user.create({
      data: { email, firstName: "C", lastName: email, role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: user.id },
    });
    return { userId: user.id, profileId: profile.id };
  }

  const activeReformer = await client("active.reformer@e2e.test");
  await prisma.clientPackage.create({
    data: {
      clientProfileId: activeReformer.profileId,
      packageTypeId: reformerPt.id,
      classTypeId: reformer.id,
      lateCancelHours: 8,
      startsAt: new Date(current - 5 * DAY),
      expiresAt: new Date(current + 25 * DAY),
      sessionsRemaining: 8,
    },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: activeReformer.userId,
      amount: 12000,
      method: "CARD",
      status: "CONFIRMED",
      createdAt: new Date(current - 5 * DAY),
    },
  });

  const activeEnergy = await client("active.energy@e2e.test");
  await prisma.clientPackage.create({
    data: {
      clientProfileId: activeEnergy.profileId,
      packageTypeId: energyPt.id,
      classTypeId: energy.id,
      lateCancelHours: 8,
      startsAt: new Date(current - 2 * DAY),
      expiresAt: new Date(current + 28 * DAY),
      sessionsRemaining: 12,
    },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: activeEnergy.userId,
      amount: 13000,
      method: "CASH",
      status: "CONFIRMED",
      createdAt: new Date(current - 2 * DAY),
    },
  });

  const expired = await client("expired@e2e.test");
  await prisma.clientPackage.create({
    data: {
      clientProfileId: expired.profileId,
      packageTypeId: reformerPt.id,
      classTypeId: reformer.id,
      lateCancelHours: 8,
      // createdAt defaults to wall-clock insertion time; pin it to the
      // seeded purchase moment so the lapsed recency check sees an OLD package.
      createdAt: new Date(current - 37 * DAY),
      startsAt: new Date(current - 37 * DAY),
      expiresAt: new Date(current - 7 * DAY),
      sessionsRemaining: 4,
    },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: expired.userId,
      amount: 12000,
      method: "CARD",
      status: "CONFIRMED",
      createdAt: new Date(current - 37 * DAY),
    },
  });

  const paused = await client("paused@e2e.test");
  await prisma.clientPackage.create({
    data: {
      clientProfileId: paused.profileId,
      packageTypeId: reformerPt.id,
      classTypeId: reformer.id,
      lateCancelHours: 8,
      startsAt: new Date(current - 5 * DAY),
      expiresAt: new Date(current + 25 * DAY),
      sessionsRemaining: 10,
    },
  });
  await prisma.packagePause.create({
    data: {
      clientProfileId: paused.profileId,
      startsAt: new Date(current - DAY),
      endsAt: new Date(current + 7 * DAY),
      reason: "Vacation",
    },
  });

  const future = await client("future@e2e.test");
  await prisma.clientPackage.create({
    data: {
      clientProfileId: future.profileId,
      packageTypeId: reformerPt.id,
      classTypeId: reformer.id,
      lateCancelHours: 8,
      startsAt: new Date(current + 7 * DAY),
      expiresAt: new Date(current + 37 * DAY),
      sessionsRemaining: 12,
    },
  });

  const empty = await client("empty@e2e.test");

  return {
    reformer,
    energy,
    activeReformer,
    activeEnergy,
    expired,
    paused,
    future,
    empty,
  };
}

describe("resolveCampaignAudience", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("everyone returns all clients", async () => {
    const m = await seedMatrix();
    const ids = await resolveCampaignAudience({ everyone: true });
    expect(ids.sort()).toEqual(
      [
        m.activeReformer,
        m.activeEnergy,
        m.expired,
        m.paused,
        m.future,
        m.empty,
      ]
        .map((c) => c.userId)
        .sort(),
    );
  });

  it("countCampaignAudience matches resolve length for everyone", async () => {
    await seedMatrix();
    const count = await countCampaignAudience({ everyone: true });
    const ids = await resolveCampaignAudience({ everyone: true });
    expect(count).toBe(ids.length);
    expect(count).toBe(6);
  });

  it("packageState=active selects only clients with a live, non-paused package", async () => {
    const m = await seedMatrix();
    expect((await resolveCampaignAudience({ packageState: "active" })).sort()).toEqual(
      [m.activeReformer.userId, m.activeEnergy.userId].sort(),
    );
  });
  it("packageState=paused selects only the client inside a pause window", async () => {
    const m = await seedMatrix();
    expect(await resolveCampaignAudience({ packageState: "paused" })).toEqual([
      m.paused.userId,
    ]);
  });
  it("packageState=expired selects clients with a package but none active", async () => {
    const m = await seedMatrix();
    // expired (expired pack) + future (not-yet-started pack) both have a package, none active.
    // paused is EXCLUDED because its package is live by date (just inside a pause window).
    expect((await resolveCampaignAudience({ packageState: "expired" })).sort()).toEqual(
      [m.expired.userId, m.future.userId].sort(),
    );
  });
  it("packageState=none selects only the client with zero packages", async () => {
    const m = await seedMatrix();
    expect(await resolveCampaignAudience({ packageState: "none" })).toEqual([
      m.empty.userId,
    ]);
  });

  it("classType selects clients who own/owned a package scoped to that ClassType", async () => {
    const m = await seedMatrix();
    expect(
      (await resolveCampaignAudience({ classTypeId: m.reformer.id })).sort(),
    ).toEqual(
      [
        m.activeReformer.userId,
        m.expired.userId,
        m.paused.userId,
        m.future.userId,
      ].sort(),
    );
  });
  it("classType=energy selects only the energy client", async () => {
    const m = await seedMatrix();
    expect(await resolveCampaignAudience({ classTypeId: m.energy.id })).toEqual([
      m.activeEnergy.userId,
    ]);
  });

  it("expiringSoon=10 selects active packages expiring within 10 days", async () => {
    const m = await seedMatrix();
    const soonUser = await prisma.user.create({
      data: {
        email: "soon@e2e.test",
        firstName: "S",
        lastName: "Soon",
        role: "CLIENT",
      },
    });
    const soonProfile = await prisma.clientProfile.create({
      data: { userId: soonUser.id },
    });
    const reformerPt = await prisma.packageType.findFirstOrThrow({
      where: { classTypeId: m.reformer.id },
    });
    const current = now().getTime();
    await prisma.clientPackage.create({
      data: {
        clientProfileId: soonProfile.id,
        packageTypeId: reformerPt.id,
        classTypeId: m.reformer.id,
        lateCancelHours: 8,
        startsAt: new Date(current - 20 * DAY),
        expiresAt: new Date(current + 3 * DAY),
        sessionsRemaining: 2,
      },
    });
    expect(await resolveCampaignAudience({ expiringSoonDays: 10 })).toEqual([
      soonUser.id,
    ]);
  });

  it("lapsed=30 selects clients with no active package and no payment in last 30d", async () => {
    const m = await seedMatrix();
    // expired: pack created 37d ago, last payment 37d ago, no active pack -> lapsed.
    // empty: no packages, no payments -> lapsed.
    // future: pack created ~now (recent) -> NOT lapsed even though no active pack.
    expect((await resolveCampaignAudience({ lapsedDays: 30 })).sort()).toEqual(
      [m.expired.userId, m.empty.userId].sort(),
    );
  });
  it("lapsed excludes a client who paid within the window", async () => {
    const m = await seedMatrix();
    const current = now().getTime();
    await prisma.billingRecord.create({
      data: {
        clientUserId: m.expired.userId,
        amount: 1000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date(current - 5 * DAY),
      },
    });
    expect(await resolveCampaignAudience({ lapsedDays: 30 })).toEqual([
      m.empty.userId,
    ]);
  });

  it("idlePackage=7 selects active-package clients who booked nothing in the first 7 days", async () => {
    const m = await seedMatrix();
    const pkg = await prisma.clientPackage.findFirstOrThrow({
      where: { clientProfile: { userId: m.activeReformer.userId } },
    });
    const room = await prisma.studioRoom.create({
      data: { name: "R1", capacity: 6 },
    });
    const trainer = await prisma.user.create({
      data: {
        email: "trainer@e2e.test",
        firstName: "T",
        lastName: "Rainer",
        role: "TRAINER",
      },
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: m.reformer.id,
        roomId: room.id,
        trainerUserId: trainer.id,
        startsAt: new Date(pkg.startsAt.getTime() + 1 * DAY),
        endsAt: new Date(pkg.startsAt.getTime() + 1 * DAY + 60 * 60 * 1000),
        capacity: 6,
      },
    });
    const profile = await prisma.clientProfile.findFirstOrThrow({
      where: { userId: m.activeReformer.userId },
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: profile.id,
        clientPackageId: pkg.id,
      },
    });
    // activeReformer booked in-window -> excluded. activeEnergy + paused have
    // active packages, no in-window booking -> idle.
    expect((await resolveCampaignAudience({ idlePackageDays: 7 })).sort()).toEqual(
      [m.activeEnergy.userId, m.paused.userId].sort(),
    );
  });

  it("combining classType AND packageState=active narrows to the intersection", async () => {
    const m = await seedMatrix();
    expect(
      await resolveCampaignAudience({
        classTypeId: m.reformer.id,
        packageState: "active",
      }),
    ).toEqual([m.activeReformer.userId]);
  });
  it("count matches resolve for a combined spec", async () => {
    const m = await seedMatrix();
    const spec = { classTypeId: m.reformer.id, packageState: "active" as const };
    expect(await countCampaignAudience(spec)).toBe(
      (await resolveCampaignAudience(spec)).length,
    );
  });
});

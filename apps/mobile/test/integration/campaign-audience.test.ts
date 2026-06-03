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
});

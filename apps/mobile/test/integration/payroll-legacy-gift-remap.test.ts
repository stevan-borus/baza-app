import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resetDb } from "./setup-db";
import { prisma } from "@/lib/server/prisma";

/**
 * The legacy-gift remap migration.
 *
 * Gifts used to be unpriced 1-session SKUs, so a gifted session was worth
 * nothing and the trainer would have been paid nothing for real work. The
 * migration repoints those packages at the priced package clients on that
 * class type actually buy most, leaving the granted count alone.
 *
 * Re-running the shipped SQL here (rather than asserting on already-migrated
 * rows) is what makes this a test of the migration itself: resetDb truncates,
 * so the fixtures below are the "legacy" state it has to handle.
 */

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    "../../prisma/migrations/20260810195709_remap_legacy_gift_packages/migration.sql",
  ),
  "utf8",
);

async function runRemap() {
  // Strip comments so the statement splitter sees only SQL.
  const sql = MIGRATION_SQL.split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
}

async function seedClassTypeWithPackages() {
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const reformer12 = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 60,
      lateCancelHours: 12,
      price: 15000,
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  // A cross-brand package that ALSO covers reformer and is cheaper per
  // session — the trap a naive "cheapest" rule would fall into.
  const energy = await prisma.packageType.create({
    data: {
      name: "Energy",
      sessionCount: 12,
      validityDays: 60,
      lateCancelHours: 12,
      price: 13000,
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  const giftSku = await prisma.packageType.create({
    data: {
      name: "Rođendanski paket (reformer)",
      sessionCount: 1,
      validityDays: 30,
      lateCancelHours: 8,
      isBirthdayGift: true,
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  return { reformer, reformer12, energy, giftSku };
}

async function makeClientProfile(name: string) {
  const user = await prisma.user.create({
    data: {
      email: `${name}@test.local`,
      firstName: name,
      lastName: "K",
      role: "CLIENT",
      clientProfile: { create: {} },
    },
    select: { clientProfile: { select: { id: true } } },
  });
  return user.clientProfile!.id;
}

async function createPackage(
  clientProfileId: string,
  packageTypeId: string,
  classTypeId: string,
  sessions: number,
) {
  return prisma.clientPackage.create({
    data: {
      clientProfileId,
      packageTypeId,
      classTypes: { create: { classTypeId } },
      lateCancelHours: 12,
      startsAt: new Date("2026-07-01T05:00:00.000Z"),
      expiresAt: new Date("2026-09-01T05:00:00.000Z"),
      sessionsRemaining: sessions,
      sessionsGranted: sessions,
    },
  });
}

describe("legacy gift remap migration", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("repoints a legacy gift at the most-bought priced package and flags it", async () => {
    const seeded = await seedClassTypeWithPackages();
    // Make Reformer 12 the most-bought package for this class type.
    for (const name of ["a", "b", "c"]) {
      const profile = await makeClientProfile(name);
      await createPackage(profile, seeded.reformer12.id, seeded.reformer.id, 12);
    }
    const energyBuyer = await makeClientProfile("d");
    await createPackage(energyBuyer, seeded.energy.id, seeded.reformer.id, 12);

    const giftProfile = await makeClientProfile("gift");
    const gift = await createPackage(giftProfile, seeded.giftSku.id, seeded.reformer.id, 1);

    await runRemap();

    const after = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: gift.id },
      include: { packageType: true },
    });
    expect(after.isGift).toBe(true);
    // NOT Energy, even though Energy is cheaper per session and also covers
    // reformer — the gift stood in for what people actually buy.
    expect(after.packageType.name).toBe("Reformer 12");
    // The grant itself must not grow: a 1-session gift stays one session.
    expect(after.sessionsGranted).toBe(1);
    expect(after.sessionsRemaining).toBe(1);
    // 15000/12 = 1250 per session, so the trainer is now paid for it.
    expect(after.packageType.price).toBe(15000);
  });

  it("leaves ordinary paid packages completely alone", async () => {
    const seeded = await seedClassTypeWithPackages();
    const profile = await makeClientProfile("paid");
    const paid = await createPackage(profile, seeded.reformer12.id, seeded.reformer.id, 12);

    await runRemap();

    const after = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: paid.id },
    });
    expect(after.isGift).toBe(false);
    expect(after.packageTypeId).toBe(seeded.reformer12.id);
    expect(after.sessionsGranted).toBe(12);
  });

  it("leaves a gift alone when its class type has no priced package to map to", async () => {
    const orphanClass = await prisma.classType.create({
      data: { name: "Novi program", maxClients: 6, durationMins: 60 },
    });
    const giftSku = await prisma.packageType.create({
      data: {
        name: "Poklon (novi)",
        sessionCount: 1,
        validityDays: 30,
        lateCancelHours: 8,
        isBirthdayGift: true,
        classTypes: { create: { classTypeId: orphanClass.id } },
      },
    });
    const profile = await makeClientProfile("orphan");
    const gift = await createPackage(profile, giftSku.id, orphanClass.id, 1);

    await runRemap();

    const after = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: gift.id },
    });
    // Kept as-is: it surfaces as "unpriced" on the payroll period, which needs
    // an admin decision rather than an invented price.
    expect(after.packageTypeId).toBe(giftSku.id);
  });

  it("is safe to run twice", async () => {
    const seeded = await seedClassTypeWithPackages();
    const buyer = await makeClientProfile("buyer");
    await createPackage(buyer, seeded.reformer12.id, seeded.reformer.id, 12);
    const giftProfile = await makeClientProfile("gift");
    const gift = await createPackage(giftProfile, seeded.giftSku.id, seeded.reformer.id, 1);

    await runRemap();
    await runRemap();

    const after = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: gift.id },
      include: { packageType: true },
    });
    expect(after.packageType.name).toBe("Reformer 12");
    expect(after.sessionsGranted).toBe(1);
  });
});

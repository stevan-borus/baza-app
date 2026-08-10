import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resetDb } from "./setup-db";
import { prisma } from "@/lib/server/prisma";

/**
 * The make-up ("Nadoknada") pricing migration.
 *
 * A make-up package is one session handed to a client who missed a training.
 * Unpriced, it pays the trainer nothing for a session they actually taught, so
 * the migration prices it from the package clients on those class types
 * actually buy.
 *
 * Re-running the shipped SQL against seeded fixtures is what makes this a test
 * of the migration rather than of already-migrated rows.
 */

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    "../../prisma/migrations/20260810204317_price_nadoknada_packages/migration.sql",
  ),
  "utf8",
);

async function runPricing() {
  const sql = MIGRATION_SQL.split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
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

async function sell(packageTypeId: string, classTypeId: string, buyer: string) {
  const clientProfileId = await makeClientProfile(buyer);
  await prisma.clientPackage.create({
    data: {
      clientProfileId,
      packageTypeId,
      classTypes: { create: { classTypeId } },
      lateCancelHours: 12,
      startsAt: new Date("2026-07-01T05:00:00.000Z"),
      expiresAt: new Date("2026-09-01T05:00:00.000Z"),
      sessionsRemaining: 12,
      sessionsGranted: 12,
    },
  });
}

describe("Nadoknada pricing migration", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prices a make-up at the most-bought package's per-session rate", async () => {
    const reformer = await prisma.classType.create({
      data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
    });
    const reformer12 = await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 60,
        lateCancelHours: 12,
        price: 15000, // 1250 / session
        classTypes: { create: { classTypeId: reformer.id } },
      },
    });
    // Cheaper per session AND covers the same class type — the trap a
    // minimum-price rule falls into.
    const energy = await prisma.packageType.create({
      data: {
        name: "Energy",
        sessionCount: 12,
        validityDays: 60,
        lateCancelHours: 12,
        price: 13000, // 1083 / session
        classTypes: { create: { classTypeId: reformer.id } },
      },
    });
    const makeUp = await prisma.packageType.create({
      data: {
        name: "Nadoknada (reformer)",
        sessionCount: 1,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: { create: { classTypeId: reformer.id } },
      },
    });

    await sell(reformer12.id, reformer.id, "a");
    await sell(reformer12.id, reformer.id, "b");
    await sell(energy.id, reformer.id, "c");

    await runPricing();

    const after = await prisma.packageType.findUniqueOrThrow({
      where: { id: makeUp.id },
    });
    // 1250 × 1 session — NOT Energy's 1083.
    expect(after.price).toBe(1250);
  });

  it("does not depend on which class type of a multi-class SKU comes first by id", async () => {
    // The real make-up SKUs cover more than one class type, so a rule that
    // picked "the first class type by id" would return a different price
    // depending on uuid ordering.
    const energyClass = await prisma.classType.create({
      data: { name: "Energy pilates", maxClients: 8, durationMins: 60 },
    });
    const reformerClass = await prisma.classType.create({
      data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
    });
    const reformer12 = await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 60,
        lateCancelHours: 12,
        price: 15000,
        classTypes: { create: { classTypeId: reformerClass.id } },
      },
    });
    await prisma.packageType.create({
      data: {
        name: "Energy",
        sessionCount: 12,
        validityDays: 60,
        lateCancelHours: 12,
        price: 13000,
        classTypes: { create: { classTypeId: energyClass.id } },
      },
    });
    const makeUp = await prisma.packageType.create({
      data: {
        name: "Nadoknada (energy)",
        sessionCount: 1,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: {
          create: [
            { classTypeId: energyClass.id },
            { classTypeId: reformerClass.id },
          ],
        },
      },
    });

    // Reformer 12 is the most-bought across the covered set.
    await sell(reformer12.id, reformerClass.id, "a");
    await sell(reformer12.id, reformerClass.id, "b");

    await runPricing();

    const after = await prisma.packageType.findUniqueOrThrow({
      where: { id: makeUp.id },
    });
    expect(after.price).toBe(1250);
  });

  it("leaves an already-priced package alone", async () => {
    const classType = await prisma.classType.create({
      data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
    });
    await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 60,
        lateCancelHours: 12,
        price: 15000,
        classTypes: { create: { classTypeId: classType.id } },
      },
    });
    const priced = await prisma.packageType.create({
      data: {
        name: "Nadoknada (already priced)",
        sessionCount: 1,
        validityDays: 30,
        lateCancelHours: 12,
        price: 900,
        classTypes: { create: { classTypeId: classType.id } },
      },
    });

    await runPricing();

    const after = await prisma.packageType.findUniqueOrThrow({
      where: { id: priced.id },
    });
    expect(after.price).toBe(900);
  });

  it("never touches gift SKUs, which are being retired rather than priced", async () => {
    const classType = await prisma.classType.create({
      data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
    });
    await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 60,
        lateCancelHours: 12,
        price: 15000,
        classTypes: { create: { classTypeId: classType.id } },
      },
    });
    const gift = await prisma.packageType.create({
      data: {
        name: "Rođendanski paket",
        sessionCount: 1,
        validityDays: 30,
        lateCancelHours: 8,
        isBirthdayGift: true,
        classTypes: { create: { classTypeId: classType.id } },
      },
    });

    await runPricing();

    const after = await prisma.packageType.findUniqueOrThrow({
      where: { id: gift.id },
    });
    expect(after.price).toBeNull();
  });

  it("leaves a make-up unpriced when nothing priced covers its class type", async () => {
    const orphan = await prisma.classType.create({
      data: { name: "Novi program", maxClients: 6, durationMins: 60 },
    });
    const makeUp = await prisma.packageType.create({
      data: {
        name: "Nadoknada (novi)",
        sessionCount: 1,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: { create: { classTypeId: orphan.id } },
      },
    });

    await runPricing();

    const after = await prisma.packageType.findUniqueOrThrow({
      where: { id: makeUp.id },
    });
    // Payroll reports it as unpriced — an admin decision, not a guess.
    expect(after.price).toBeNull();
  });
});

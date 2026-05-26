import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";
import { resetDb } from "./setup-db";

describe("Booking.createdByUserId audit field", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("persists the admin who created an admin reservation and reads it back via relation", async () => {
    const admin = await prisma.user.create({
      data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
    });
    const trainer = await prisma.user.create({
      data: { email: "trainer@test.local", fullName: "Trainer", role: "TRAINER" },
    });
    const clientUser = await prisma.user.create({
      data: { email: "client@test.local", fullName: "Client", role: "CLIENT" },
    });
    const clientProfile = await prisma.clientProfile.create({
      data: { userId: clientUser.id },
    });
    const classType = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
        endsAt: new Date(nowMs() + 25 * 60 * 60 * 1000),
        capacity: 6,
      },
    });

    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: null,
        createdByUserId: admin.id,
      },
      include: { createdBy: true },
    });

    expect(booking.createdByUserId).toBe(admin.id);
    expect(booking.createdBy?.id).toBe(admin.id);
    expect(booking.clientPackageId).toBeNull();
  });

  it("leaves createdByUserId null when omitted (client self-booking)", async () => {
    const trainer = await prisma.user.create({
      data: { email: "trainer@test.local", fullName: "Trainer", role: "TRAINER" },
    });
    const clientUser = await prisma.user.create({
      data: { email: "client@test.local", fullName: "Client", role: "CLIENT" },
    });
    const clientProfile = await prisma.clientProfile.create({
      data: { userId: clientUser.id },
    });
    const classType = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
        endsAt: new Date(nowMs() + 25 * 60 * 60 * 1000),
        capacity: 6,
      },
    });

    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
      },
    });

    expect(booking.createdByUserId).toBeNull();
  });
});

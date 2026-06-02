import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./setup-db";

import {
  trainerLinkedToClientProfile,
  trainerOwnsSession,
} from "@/lib/server/trainer-scope";
import { prisma } from "@/lib/server/prisma";

async function seed() {
  const trainerA = await prisma.user.create({
    data: { email: "trainer.a@test.local", firstName: "Trainer", lastName: "A", role: "TRAINER" },
  });
  const trainerB = await prisma.user.create({
    data: { email: "trainer.b@test.local", firstName: "Trainer", lastName: "B", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "Test", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return { trainerA, trainerB, clientProfile, reformer };
}

async function createSession(trainerUserId: string, classTypeId: string) {
  return prisma.session.create({
    data: {
      classTypeId,
      trainerUserId,
      startsAt: new Date("2026-06-15T10:00:00Z"),
      endsAt: new Date("2026-06-15T11:00:00Z"),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

describe("trainer-scope", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe("trainerLinkedToClientProfile", () => {
    it("returns true when an active booking links the trainer to the client", async () => {
      const { trainerA, clientProfile, reformer } = await seed();
      const session = await createSession(trainerA.id, reformer.id);
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: clientProfile.id,
        },
      });
      const linked = await trainerLinkedToClientProfile(
        trainerA.id,
        clientProfile.id,
      );
      expect(linked).toBe(true);
    });

    it("returns false when no booking exists between trainer and client", async () => {
      const { trainerA, clientProfile } = await seed();
      const linked = await trainerLinkedToClientProfile(
        trainerA.id,
        clientProfile.id,
      );
      expect(linked).toBe(false);
    });

    it("returns false when the only booking has been canceled", async () => {
      const { trainerA, clientProfile, reformer } = await seed();
      const session = await createSession(trainerA.id, reformer.id);
      await prisma.booking.create({
        data: {
          sessionId: session.id,
          clientProfileId: clientProfile.id,
          canceledAt: new Date("2026-06-10T12:00:00Z"),
        },
      });
      const linked = await trainerLinkedToClientProfile(
        trainerA.id,
        clientProfile.id,
      );
      expect(linked).toBe(false);
    });

    it("does not falsely link a trainer to a client booked with a different trainer", async () => {
      const { trainerA, trainerB, clientProfile, reformer } = await seed();
      const sessionB = await createSession(trainerB.id, reformer.id);
      await prisma.booking.create({
        data: {
          sessionId: sessionB.id,
          clientProfileId: clientProfile.id,
        },
      });
      const linkedToA = await trainerLinkedToClientProfile(
        trainerA.id,
        clientProfile.id,
      );
      expect(linkedToA).toBe(false);
    });
  });

  describe("trainerOwnsSession", () => {
    it("returns true for a session assigned to the trainer", async () => {
      const { trainerA, reformer } = await seed();
      const session = await createSession(trainerA.id, reformer.id);
      expect(await trainerOwnsSession(trainerA.id, session.id)).toBe(true);
    });

    it("returns false for a session assigned to a different trainer", async () => {
      const { trainerA, trainerB, reformer } = await seed();
      const session = await createSession(trainerB.id, reformer.id);
      expect(await trainerOwnsSession(trainerA.id, session.id)).toBe(false);
    });
  });
});

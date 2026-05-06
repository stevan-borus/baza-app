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

vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
}));

import { DELETE } from "@/app/api/sessions/[id]/+api";
import { prisma } from "@/lib/server/prisma";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seedSessionWith(opts?: { withBooking?: boolean }) {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", fullName: "Trainer", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const startsAt = new Date(Date.now() + 2 * DAY_MS);
  const session = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      capacity: 6,
      status: "SCHEDULED",
      isActive: true,
    },
  });
  if (opts?.withBooking) {
    const client = await prisma.user.create({
      data: { email: "c@test.local", fullName: "C", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profile.id },
    });
  }
  return { trainer, session };
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

function asTrainer(t: { id: string; email: string }) {
  setMockUser({
    id: t.id,
    role: "TRAINER",
    email: t.email,
    isActive: true,
    clientProfile: null,
  });
}

describe("DELETE /api/sessions/:id", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("admin can delete a session that has no active bookings", async () => {
    const { session } = await seedSessionWith();
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/sessions/${session.id}`, {
        method: "DELETE",
      }),
      { id: session.id },
    );
    expect(response.status).toBe(200);
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
  });

  it("admin DELETE is rejected with 409 when the session has active bookings", async () => {
    const { session } = await seedSessionWith({ withBooking: true });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/sessions/${session.id}`, {
        method: "DELETE",
      }),
      { id: session.id },
    );
    expect(response.status).toBe(409);
    expect(await prisma.session.findUnique({ where: { id: session.id } })).not.toBeNull();
  });

  it("trainer DELETE is rejected with 403 (admin-only true delete)", async () => {
    const { trainer, session } = await seedSessionWith();
    asTrainer(trainer);
    const response = await DELETE(
      new Request(`http://test.local/api/sessions/${session.id}`, {
        method: "DELETE",
      }),
      { id: session.id },
    );
    expect(response.status).toBe(403);
    expect(await prisma.session.findUnique({ where: { id: session.id } })).not.toBeNull();
  });
});

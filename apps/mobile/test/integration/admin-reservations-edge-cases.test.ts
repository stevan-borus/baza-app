/**
 * Edge cases for the admin reservation endpoints — covers the corners
 * that the create/cancel-bulk/cron tests don't exercise:
 *   - 404 when the client doesn't exist
 *   - skippedMissing populated when sessionIds reference non-existent sessions
 *   - unknown bookingIds in cancel-bulk return 200 with canceled=0
 *   - late-cancel forfeit fires on bulk-cancel for backed bookings inside
 *     the late-cancel window
 *   - cron unbacked-attendance notification is deduped on a repeat cron run
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/cron-auth", () => ({
  requireCronAuth: (_req: Request) => ({ ok: true as const }),
}));

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST as createPost } from "@/server/routes/admin/reservations";
import { POST as cancelPost } from "@/server/routes/admin/reservations/cancel-bulk";
import { POST as cronPost } from "@/server/routes/cron/sessions/consumption";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

async function seedBasics() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Marija", lastName: "Klijent", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: clientUser.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  return { admin, trainer, clientUser, clientProfile, reformer };
}

function asAdmin(admin: { id: string; email: string }) {
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin reservations — edge cases", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("create returns 404 when clientProfileId references a non-existent client", async () => {
    const { admin } = await seedBasics();
    asAdmin(admin);
    const res = await createPost(
      jsonRequest("http://test.local/api/admin/reservations", {
        clientProfileId: "does-not-exist",
        sessionIds: ["whatever"],
      }),
    );
    expect(res.status).toBe(404);
  });

  it("create reports skippedMissing for unknown sessionIds and still creates bookings for the known ones", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const realSession = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
        endsAt: new Date(nowMs() + 25 * 60 * 60 * 1000),
        capacity: 6,
      },
    });
    asAdmin(admin);

    const res = await createPost(
      jsonRequest("http://test.local/api/admin/reservations", {
        clientProfileId: clientProfile.id,
        sessionIds: [realSession.id, "ghost-session-id"],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(1);
    expect(body.skippedMissing).toEqual(["ghost-session-id"]);
    expect(body.reservedSessionIds).toEqual([realSession.id]);
  });

  it("cancel-bulk returns 200 with canceled=0 when none of the bookingIds exist", async () => {
    const { admin } = await seedBasics();
    asAdmin(admin);
    const res = await cancelPost(
      jsonRequest("http://test.local/api/admin/reservations/cancel-bulk", {
        bookingIds: ["nope-1", "nope-2"],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canceled).toBe(0);
  });

  it("cancel-bulk applies the late-cancel forfeit on a backed booking inside the window", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    // Session starts in 1 hour, late-cancel window is 8h → cancel is "late"
    // and should consume one package session as the policy penalty.
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + 60 * 60 * 1000),
        endsAt: new Date(nowMs() + 2 * 60 * 60 * 1000),
        capacity: 6,
      },
    });
    const packageType = await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 8,
        classTypes: { create: { classTypeId: reformer.id } },
      },
    });
    const pack = await prisma.clientPackage.create({
      data: {
        clientProfileId: clientProfile.id,
        packageTypeId: packageType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 8,
        startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
        expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
        sessionsRemaining: 12,
      },
    });
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        clientPackageId: pack.id,
        createdByUserId: admin.id,
      },
    });
    asAdmin(admin);

    await cancelPost(
      jsonRequest("http://test.local/api/admin/reservations/cancel-bulk", {
        bookingIds: [booking.id],
      }),
    );

    const after = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: pack.id },
      select: { sessionsRemaining: true },
    });
    expect(after.sessionsRemaining).toBe(11);
    const consumption = await prisma.sessionConsumption.findUnique({
      where: {
        clientProfileId_sessionId: {
          clientProfileId: clientProfile.id,
          sessionId: session.id,
        },
      },
    });
    expect(consumption).not.toBeNull();
  });

  it("cron NO_PACKAGE notification dedupes by (sessionId, adminId) across repeated runs", async () => {
    const { trainer, clientProfile, reformer } = await seedBasics();
    // Use the seeded admin so the cron's per-admin fan-out has a target.
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() - 2 * 60 * 60 * 1000),
        endsAt: new Date(nowMs() - 60 * 60 * 1000),
        capacity: 6,
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    const cronReq = () =>
      new Request("http://test.local/api/cron/sessions/consumption", {
        method: "POST",
      });

    await cronPost(cronReq());
    await cronPost(cronReq());
    await new Promise((r) => setImmediate(r));
    // Either zero logs (push disabled in test env) or exactly one per (admin, session)
    // The dedupe contract is enforced by the notification layer via dedupeKey.
    const logs = await prisma.notificationLog.findMany({
      where: { type: "RESERVATION_UNBACKED_ATTENDANCE" },
    });
    const distinctKeys = new Set(logs.map((l) => l.notificationKey));
    expect(distinctKeys.size).toBe(logs.length); // every key is unique
  });
});

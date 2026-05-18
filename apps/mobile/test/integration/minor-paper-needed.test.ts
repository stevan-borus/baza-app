/**
 * Integration tests for the MINOR_PAPER_NEEDED notification trigger.
 *
 * When a session transitions SCHEDULED → COMPLETED, the PATCH handler calls
 * maybeNotifyMinorPaperNeeded. These tests exercise that wired path end-to-end
 * (via the PATCH route) so the trigger itself is covered, not just the helper
 * in isolation.
 *
 * Guards verified:
 *   1. Happy path — minor, no guardianVerifiedAt, first session → admin notified
 *   2. Adult client — skipped
 *   3. Guardian already verified — skipped
 *   4. Not the first completed session — skipped
 *   5. Multiple active admins — each receives exactly one notification
 */
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

// Let createSystemNotification actually write to the DB — we want to assert
// that NotificationLog rows are created with the right type. We only need to
// prevent the Expo push dispatch from making real network calls.
vi.mock("@/lib/server/notifications", async () => {
  const actual = await import("@/lib/server/notifications");
  return {
    ...actual,
    createAndDispatchUserNotification: vi.fn(async (input: Parameters<typeof actual.createAndDispatchUserNotification>[0]) => {
      const { prisma } = await import("@/lib/server/prisma");
      const { Prisma } = await import("@/generated/prisma");
      const jsonPayload =
        input.payload === undefined
          ? undefined
          : (JSON.parse(JSON.stringify(input.payload)) as typeof Prisma.JsonNull);
      return prisma.notificationLog.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          payload: jsonPayload,
        },
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          body: true,
          payload: true,
          pushSent: true,
          pushStatus: true,
          readAt: true,
          createdAt: true,
        },
      });
    }),
  };
});

import { PATCH } from "@/app/api/sessions/[id]/+api";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;

// Build a date that is exactly `years` years before the anchor "now".
function dobYearsAgo(years: number): Date {
  const d = now();
  d.setFullYear(d.getFullYear() - years);
  return d;
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

function patchRequest(sessionId: string, body: unknown) {
  return new Request(`https://t.local/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Creates a minimal session + booking scaffold.  Returns session id. */
async function scaffold(opts: {
  clientDob: Date;
  classTypeId: string;
  trainerId: string;
  clientProfileId: string;
}) {
  const past = new Date(now().getTime() - 2 * HOUR_MS);
  const pastEnd = new Date(past.getTime() + HOUR_MS);

  const session = await prisma.session.create({
    data: {
      startsAt: past,
      endsAt: pastEnd,
      capacity: 5,
      status: "SCHEDULED",
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerId,
    },
  });

  await prisma.booking.create({
    data: { sessionId: session.id, clientProfileId: opts.clientProfileId },
  });

  return session;
}

describe("MINOR_PAPER_NEEDED notification trigger", () => {
  let admin: { id: string; email: string };
  let trainer: { id: string; email: string };
  let classTypeId: string;

  beforeEach(async () => {
    await resetDb();

    const adminUser = await prisma.user.create({
      data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN", isActive: true },
    });
    admin = { id: adminUser.id, email: adminUser.email };

    const trainerUser = await prisma.user.create({
      data: { email: "trainer@test.local", fullName: "Trainer", role: "TRAINER" },
    });
    trainer = { id: trainerUser.id, email: trainerUser.email };

    const ct = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    classTypeId = ct.id;
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  // ----------------------------------------------------------------
  // 1. Happy path
  // ----------------------------------------------------------------
  it("fires MINOR_PAPER_NEEDED when a minor's first session is completed", async () => {
    const clientUser = await prisma.user.create({
      data: {
        email: "minor@test.local",
        fullName: "Minor Client",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: dobYearsAgo(15) } },
      },
      include: { clientProfile: true },
    });
    const cp = clientUser.clientProfile!;

    // waiver_minor accepted but not yet physically verified
    await prisma.consentRecord.create({
      data: {
        userId: clientUser.id,
        documentKey: "waiver_minor",
        version: 1,
        locale: "sr",
        accepted: true,
        guardianName: "Parent Name",
        guardianRelation: "parent",
        guardianVerifiedAt: null,
      },
    });

    const session = await scaffold({
      clientDob: dobYearsAgo(15),
      classTypeId,
      trainerId: trainer.id,
      clientProfileId: cp.id,
    });

    asAdmin(admin);
    const res = await PATCH(patchRequest(session.id, { status: "COMPLETED" }), { id: session.id });
    expect(res.status).toBe(200);

    const logs = await prisma.notificationLog.findMany({
      where: { userId: admin.id, type: "MINOR_PAPER_NEEDED" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("MINOR_PAPER_NEEDED");
  });

  // ----------------------------------------------------------------
  // 2. Adult client — should NOT fire
  // ----------------------------------------------------------------
  it("does NOT fire for an adult client", async () => {
    const clientUser = await prisma.user.create({
      data: {
        email: "adult@test.local",
        fullName: "Adult Client",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: dobYearsAgo(25) } },
      },
      include: { clientProfile: true },
    });
    const cp = clientUser.clientProfile!;

    const session = await scaffold({
      clientDob: dobYearsAgo(25),
      classTypeId,
      trainerId: trainer.id,
      clientProfileId: cp.id,
    });

    asAdmin(admin);
    const res = await PATCH(patchRequest(session.id, { status: "COMPLETED" }), { id: session.id });
    expect(res.status).toBe(200);

    const logs = await prisma.notificationLog.findMany({
      where: { type: "MINOR_PAPER_NEEDED" },
    });
    expect(logs).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // 3. Guardian already verified — should NOT fire
  // ----------------------------------------------------------------
  it("does NOT fire when guardianVerifiedAt is already set", async () => {
    const clientUser = await prisma.user.create({
      data: {
        email: "minor-verified@test.local",
        fullName: "Verified Minor",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: dobYearsAgo(14) } },
      },
      include: { clientProfile: true },
    });
    const cp = clientUser.clientProfile!;

    await prisma.consentRecord.create({
      data: {
        userId: clientUser.id,
        documentKey: "waiver_minor",
        version: 1,
        locale: "sr",
        accepted: true,
        guardianName: "Parent",
        guardianRelation: "parent",
        guardianVerifiedAt: now(), // already verified
      },
    });

    const session = await scaffold({
      clientDob: dobYearsAgo(14),
      classTypeId,
      trainerId: trainer.id,
      clientProfileId: cp.id,
    });

    asAdmin(admin);
    const res = await PATCH(patchRequest(session.id, { status: "COMPLETED" }), { id: session.id });
    expect(res.status).toBe(200);

    const logs = await prisma.notificationLog.findMany({
      where: { type: "MINOR_PAPER_NEEDED" },
    });
    expect(logs).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // 4. Not the first completed session — should NOT fire
  // ----------------------------------------------------------------
  it("does NOT fire when the minor already has another completed session", async () => {
    const clientUser = await prisma.user.create({
      data: {
        email: "minor-repeat@test.local",
        fullName: "Repeat Minor",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: dobYearsAgo(16) } },
      },
      include: { clientProfile: true },
    });
    const cp = clientUser.clientProfile!;

    await prisma.consentRecord.create({
      data: {
        userId: clientUser.id,
        documentKey: "waiver_minor",
        version: 1,
        locale: "sr",
        accepted: true,
        guardianName: "Parent",
        guardianRelation: "parent",
        guardianVerifiedAt: null,
      },
    });

    // Create a prior session that is already COMPLETED with a booking for this client.
    const past = new Date(now().getTime() - 3 * HOUR_MS);
    const priorSession = await prisma.session.create({
      data: {
        startsAt: past,
        endsAt: new Date(past.getTime() + HOUR_MS),
        capacity: 5,
        status: "COMPLETED",
        classTypeId,
        trainerUserId: trainer.id,
      },
    });
    await prisma.booking.create({
      data: { sessionId: priorSession.id, clientProfileId: cp.id },
    });

    // Now create the second session to be completed.
    const session = await scaffold({
      clientDob: dobYearsAgo(16),
      classTypeId,
      trainerId: trainer.id,
      clientProfileId: cp.id,
    });

    asAdmin(admin);
    const res = await PATCH(patchRequest(session.id, { status: "COMPLETED" }), { id: session.id });
    expect(res.status).toBe(200);

    const logs = await prisma.notificationLog.findMany({
      where: { type: "MINOR_PAPER_NEEDED" },
    });
    expect(logs).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // 5. Multiple admins — each active admin gets exactly one notification
  // ----------------------------------------------------------------
  it("sends one notification to each active admin", async () => {
    const admin2User = await prisma.user.create({
      data: { email: "admin2@test.local", fullName: "Admin Two", role: "ADMIN", isActive: true },
    });
    // Inactive admin — should NOT receive a notification.
    await prisma.user.create({
      data: { email: "admin-off@test.local", fullName: "Admin Off", role: "ADMIN", isActive: false },
    });

    const clientUser = await prisma.user.create({
      data: {
        email: "minor-multi@test.local",
        fullName: "Multi Minor",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: dobYearsAgo(13) } },
      },
      include: { clientProfile: true },
    });
    const cp = clientUser.clientProfile!;

    await prisma.consentRecord.create({
      data: {
        userId: clientUser.id,
        documentKey: "waiver_minor",
        version: 1,
        locale: "sr",
        accepted: true,
        guardianName: "Parent",
        guardianRelation: "parent",
        guardianVerifiedAt: null,
      },
    });

    const session = await scaffold({
      clientDob: dobYearsAgo(13),
      classTypeId,
      trainerId: trainer.id,
      clientProfileId: cp.id,
    });

    asAdmin(admin);
    const res = await PATCH(patchRequest(session.id, { status: "COMPLETED" }), { id: session.id });
    expect(res.status).toBe(200);

    const logs = await prisma.notificationLog.findMany({
      where: { type: "MINOR_PAPER_NEEDED" },
      orderBy: { createdAt: "asc" },
    });
    // Exactly 2 logs — one for each ACTIVE admin.
    expect(logs).toHaveLength(2);
    const notifiedIds = logs.map((l) => l.userId).sort();
    expect(notifiedIds).toEqual([admin.id, admin2User.id].sort());
  });
});

/**
 * Characterization of the operator-notification dispatcher (`notifyOperators`)
 * — the admin/trainer mirror of `notifyClient`.
 *
 * The cross-cutting rules under test come from CONTEXT.md → Notifications:
 *   - recipients are "all active Admins" and/or "the Session's assigned Trainer"
 *   - the initiating operator is never notified about their own action
 *   - a Trainer who is also an Admin receives only the Trainer flavor
 *   - in-app NotificationLog always; push per event rule (late-cancel push,
 *     early-cancel silent)
 *   - bulk actions coalesce to one notification per recipient with a count
 *
 * No push tokens are seeded, so a push-attempted log lands with
 * pushStatus="NO_ACTIVE_PUSH_TOKENS" while a silenced (skipPush) log keeps
 * pushStatus=null — that difference is how the push-vs-silent decision is
 * observed without network.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./setup-db";

import {
  coalesceTrainerCancelCounts,
  notifyOperators,
} from "@/lib/server/notify-operators";
import { prisma } from "@/lib/server/prisma";

async function seedUser(role: "ADMIN" | "TRAINER", email: string, isActive = true) {
  return prisma.user.create({
    data: { email, firstName: role, lastName: email.split("@")[0], role, isActive },
  });
}

describe("notifyOperators", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("a trainer who is also an admin receives only the trainer-flavored notification", async () => {
    await seedUser("ADMIN", "a1@test.local");
    // Admin who is the session's assigned trainer.
    const trainerAdmin = await seedUser("ADMIN", "ta@test.local");

    await notifyOperators({
      event: "BOOKING_CANCELED",
      trainers: [{ userId: trainerAdmin.id }],
      isLate: true,
      payload: { sessionId: "s1" },
    });

    const logs = await prisma.notificationLog.findMany({
      where: { userId: trainerAdmin.id },
      select: { type: true },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("BOOKING_CANCELED_TRAINER");
  });

  it("excludes the initiating operator from both flavors", async () => {
    const otherAdmin = await seedUser("ADMIN", "a1@test.local");
    // Initiator is both an admin and the affected trainer — gets nothing.
    const initiator = await seedUser("ADMIN", "init@test.local");

    await notifyOperators({
      event: "BOOKING_CANCELED",
      trainers: [{ userId: initiator.id }],
      excludeUserId: initiator.id,
      isLate: true,
      payload: { sessionId: "s1" },
    });

    const initiatorLogs = await prisma.notificationLog.count({
      where: { userId: initiator.id },
    });
    expect(initiatorLogs).toBe(0);
    const otherLogs = await prisma.notificationLog.count({
      where: { userId: otherAdmin.id },
    });
    expect(otherLogs).toBe(1);
  });

  it("does not notify inactive admins", async () => {
    const active = await seedUser("ADMIN", "a1@test.local");
    const inactive = await seedUser("ADMIN", "gone@test.local", false);
    const trainer = await seedUser("TRAINER", "t1@test.local");

    await notifyOperators({
      event: "BOOKING_CANCELED",
      trainers: [{ userId: trainer.id }],
      isLate: true,
      payload: { sessionId: "s1" },
    });

    expect(
      await prisma.notificationLog.count({ where: { userId: active.id } }),
    ).toBe(1);
    expect(
      await prisma.notificationLog.count({ where: { userId: inactive.id } }),
    ).toBe(0);
  });

  it("late cancel pushes; early cancel stays silent in-app (BOOKING_CANCELED push rule)", async () => {
    const trainer = await seedUser("TRAINER", "t1@test.local");

    await notifyOperators({
      event: "BOOKING_CANCELED",
      trainers: [{ userId: trainer.id }],
      isLate: true,
      payload: { sessionId: "late" },
    });
    await notifyOperators({
      event: "BOOKING_CANCELED",
      trainers: [{ userId: trainer.id }],
      isLate: false,
      payload: { sessionId: "early" },
    });

    const logs = await prisma.notificationLog.findMany({
      where: { userId: trainer.id },
      select: { payload: true, pushStatus: true },
    });
    const late = logs.find((l) => (l.payload as { sessionId: string }).sessionId === "late");
    const early = logs.find((l) => (l.payload as { sessionId: string }).sessionId === "early");
    // Push was attempted for the late cancel (no tokens seeded → recorded
    // attempt), and explicitly skipped for the early one (status untouched).
    expect(late?.pushStatus).toBe("NO_ACTIVE_PUSH_TOKENS");
    expect(early?.pushStatus).toBeNull();
  });

  it("BULK_RESERVATION_CANCEL coalesces to one notification per recipient — per-trainer counts, total count for admins — and always pushes", async () => {
    const admin = await seedUser("ADMIN", "a1@test.local");
    const trainerA = await seedUser("TRAINER", "ta@test.local");
    const trainerB = await seedUser("TRAINER", "tb@test.local");

    // 3 cancelled bookings: 2 hit trainer A, 1 hits trainer B.
    await notifyOperators({
      event: "BULK_RESERVATION_CANCEL",
      trainers: coalesceTrainerCancelCounts([trainerA.id, trainerB.id, trainerA.id]),
      payload: { clientFullName: "Marija Klijent", count: 3 },
    });

    const logs = await prisma.notificationLog.findMany({
      select: { userId: true, type: true, payload: true, pushStatus: true },
    });
    expect(logs).toHaveLength(3);

    const byUser = (id: string) => logs.filter((l) => l.userId === id);
    const a = byUser(trainerA.id);
    expect(a).toHaveLength(1);
    expect(a[0].type).toBe("BULK_RESERVATION_CANCEL_TRAINER");
    expect((a[0].payload as { count: number }).count).toBe(2);

    const b = byUser(trainerB.id);
    expect(b).toHaveLength(1);
    expect((b[0].payload as { count: number }).count).toBe(1);

    const adm = byUser(admin.id);
    expect(adm).toHaveLength(1);
    expect(adm[0].type).toBe("BULK_RESERVATION_CANCEL_ADMIN");
    // Admin sees the client's total, not a per-trainer slice.
    expect((adm[0].payload as { count: number }).count).toBe(3);
    expect((adm[0].payload as { clientFullName: string }).clientFullName).toBe(
      "Marija Klijent",
    );

    // Bulk cancels always push (no late/early distinction).
    for (const log of logs) expect(log.pushStatus).toBe("NO_ACTIVE_PUSH_TOKENS");
  });

  it("SESSION_UPDATED is a trainer-only heads-up — admins are not fanned out", async () => {
    const admin = await seedUser("ADMIN", "a1@test.local");
    const trainer = await seedUser("TRAINER", "t1@test.local");

    await notifyOperators({
      event: "SESSION_UPDATED",
      trainers: [{ userId: trainer.id }],
      payload: { sessionId: "s1", status: "CANCELED" },
    });

    const logs = await prisma.notificationLog.findMany({
      select: { userId: true, type: true },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(trainer.id);
    expect(logs[0].type).toBe("SESSION_UPDATED");
    expect(
      await prisma.notificationLog.count({ where: { userId: admin.id } }),
    ).toBe(0);
  });

  it("UNBACKED_ATTENDANCE notifies all admins with a per-recipient dedupe key — a cron retry creates no duplicate rows", async () => {
    const adminA = await seedUser("ADMIN", "a1@test.local");
    const adminB = await seedUser("ADMIN", "a2@test.local");

    const dispatch = () =>
      notifyOperators({
        event: "UNBACKED_ATTENDANCE",
        payload: { sessionId: "s1", clientFullName: "Marija Klijent" },
        dedupeKey: (recipientUserId) => `unbacked:s1:${recipientUserId}`,
      });
    await dispatch();
    await dispatch(); // retry — must be idempotent

    const logs = await prisma.notificationLog.findMany({
      select: { userId: true, type: true, notificationKey: true },
    });
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.userId).sort()).toEqual([adminA.id, adminB.id].sort());
    for (const log of logs) {
      expect(log.type).toBe("RESERVATION_UNBACKED_ATTENDANCE");
      expect(log.notificationKey).toBe(`unbacked:s1:${log.userId}`);
    }
  });

  it("MINOR_PAPER_NEEDED notifies all active admins", async () => {
    const adminA = await seedUser("ADMIN", "a1@test.local");
    const adminB = await seedUser("ADMIN", "a2@test.local");

    await notifyOperators({
      event: "MINOR_PAPER_NEEDED",
      payload: { sessionId: "s1", userName: "Mali Klijent", clientUserId: "u1" },
    });

    const logs = await prisma.notificationLog.findMany({
      select: { userId: true, type: true },
    });
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.userId).sort()).toEqual([adminA.id, adminB.id].sort());
    for (const log of logs) expect(log.type).toBe("MINOR_PAPER_NEEDED");
  });

  it("BIRTHDAY_ADMIN_PROMPT keeps its global (recipient-independent) dedupe key — preserved as-is from the cron", async () => {
    await seedUser("ADMIN", "a1@test.local");
    await seedUser("ADMIN", "a2@test.local");

    await notifyOperators({
      event: "BIRTHDAY_ADMIN_PROMPT",
      payload: { clientUserId: "u1", today: "2026-05-09" },
      // The cron's key is per client+day, NOT per recipient — so with several
      // admins only the first send creates a row. Characterized, not endorsed.
      dedupeKey: () => "birthday:u1:2026-05-09",
    });

    const logs = await prisma.notificationLog.findMany({
      select: { type: true, notificationKey: true },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("BIRTHDAY_ADMIN_PROMPT");
    expect(logs[0].notificationKey).toBe("birthday:u1:2026-05-09");
  });

  it("BOOKING_CANCELED notifies the assigned trainer (trainer flavor) and every active admin (admin flavor)", async () => {
    const adminA = await seedUser("ADMIN", "a1@test.local");
    const adminB = await seedUser("ADMIN", "a2@test.local");
    const trainer = await seedUser("TRAINER", "t1@test.local");

    await notifyOperators({
      event: "BOOKING_CANCELED",
      trainers: [{ userId: trainer.id }],
      isLate: true,
      payload: { sessionId: "s1", clientFullName: "Marko Petrović" },
    });

    const logs = await prisma.notificationLog.findMany({
      select: { userId: true, type: true, payload: true },
    });
    expect(logs).toHaveLength(3);

    const trainerLogs = logs.filter((l) => l.userId === trainer.id);
    expect(trainerLogs).toHaveLength(1);
    expect(trainerLogs[0].type).toBe("BOOKING_CANCELED_TRAINER");

    for (const admin of [adminA, adminB]) {
      const adminLogs = logs.filter((l) => l.userId === admin.id);
      expect(adminLogs).toHaveLength(1);
      expect(adminLogs[0].type).toBe("BOOKING_CANCELED_ADMIN");
    }
    // Payload fields flow through to every recipient.
    expect(logs.map((l) => (l.payload as { clientFullName?: string }).clientFullName)).toEqual([
      "Marko Petrović",
      "Marko Petrović",
      "Marko Petrović",
    ]);
  });
});

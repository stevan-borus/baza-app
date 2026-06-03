import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

type SentEmail = { to: string; subject: string; heading: string; lines: string[] };
const sendSpy = vi.fn(async (_params: SentEmail) => undefined);
vi.mock("@/lib/server/resend", () => ({
  sendBookingChangeEmail: (params: SentEmail) => sendSpy(params),
}));

import { setMockUser } from "./auth-mock";

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

import { sendBookingChangeEmailIfEnabled } from "@/lib/server/booking-emails";
import { prisma } from "@/lib/server/prisma";
import { POST as cancelBulkPOST } from "@/app/api/admin/reservations/cancel-bulk/+api";
import { PATCH as sessionPATCH } from "@/app/api/sessions/[id]/+api";
import { POST as bookingsPOST } from "@/app/api/bookings/+api";
import { nowMs } from "@/lib/now";

async function seedClient(opts?: { bookingEmailsEnabled?: boolean; preferredLocale?: "sr" | "en" }) {
  const user = await prisma.user.create({
    data: { email: "mara@test.local", firstName: "Mara", lastName: "K", role: "CLIENT" },
  });
  await prisma.notificationPreference.create({
    data: {
      userId: user.id,
      bookingEmailsEnabled: opts?.bookingEmailsEnabled ?? true,
      preferredLocale: opts?.preferredLocale ?? null,
    },
  });
  return user;
}

describe("sendBookingChangeEmailIfEnabled", () => {
  beforeEach(async () => {
    await resetDb();
    sendSpy.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("sends a localized email when bookingEmailsEnabled is true (default sr)", async () => {
    const user = await seedClient();
    await sendBookingChangeEmailIfEnabled({
      userId: user.id,
      kind: "ADMIN_CANCEL",
      vars: { clientFullName: "Mara K", count: 1 },
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const arg = sendSpy.mock.calls[0][0];
    expect(arg.to).toBe("mara@test.local");
    expect(arg.subject).toBe("Vaša rezervacija je otkazana");
    // Client-voiced body (second person), not the admin third-person copy.
    expect(arg.lines.join(" ")).toContain("Tvoj termin je otkazan");
  });

  it("uses English subject when preferredLocale is en", async () => {
    const user = await seedClient({ preferredLocale: "en" });
    await sendBookingChangeEmailIfEnabled({ userId: user.id, kind: "SESSION_UPDATED", vars: {} });
    const arg = sendSpy.mock.calls[0][0];
    expect(arg.subject).toBe("Your session was updated");
  });

  it("interpolates the booking count into the BULK_CANCEL body", async () => {
    const user = await seedClient();
    await sendBookingChangeEmailIfEnabled({
      userId: user.id,
      kind: "BULK_CANCEL",
      vars: { count: 3 },
    });
    const arg = sendSpy.mock.calls[0][0];
    expect(arg.lines.join(" ")).toContain("3");
  });

  it("sends by default when the client has NO preference row (column default true)", async () => {
    // A client with no NotificationPreference row should still receive the email.
    const user = await prisma.user.create({
      data: { email: "noprefs@test.local", firstName: "No", lastName: "Prefs", role: "CLIENT" },
    });
    await sendBookingChangeEmailIfEnabled({ userId: user.id, kind: "ADMIN_CANCEL", vars: {} });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].to).toBe("noprefs@test.local");
  });

  it("does NOT send when bookingEmailsEnabled is false", async () => {
    const user = await seedClient({ bookingEmailsEnabled: false });
    await sendBookingChangeEmailIfEnabled({ userId: user.id, kind: "WAITLIST_PROMOTED", vars: {} });
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

// The integration endpoints fire the email + in-app notification inside a
// `void (async () => {...})()` block AFTER returning the response. That block
// awaits real DB round-trips, which resolve on IO/timer ticks — not just
// microtasks — so a few `setImmediate` passes aren't enough. Poll on a real
// timer until the predicate holds (or give up after the budget).
async function waitFor(predicate: () => boolean | Promise<boolean>, budgetMs = 3000) {
  const deadline = Date.now() + budgetMs;
  while (!(await predicate()) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("booking-change emails — integration points", () => {
  beforeEach(async () => {
    await resetDb();
    sendSpy.mockClear();
  });

  async function seedAdminAndClient(opts?: { bookingEmailsEnabled?: boolean }) {
    const admin = await prisma.user.create({
      data: { email: "admin@test.local", firstName: "Admin", lastName: "U", role: "ADMIN" },
    });
    const clientUser = await prisma.user.create({
      data: { email: "klijent@test.local", firstName: "Mara", lastName: "K", role: "CLIENT" },
    });
    await prisma.notificationPreference.create({
      data: { userId: clientUser.id, bookingEmailsEnabled: opts?.bookingEmailsEnabled ?? true },
    });
    const clientProfile = await prisma.clientProfile.create({ data: { userId: clientUser.id } });
    const trainer = await prisma.user.create({
      data: { email: "trainer@test.local", firstName: "Tre", lastName: "Ner", role: "TRAINER" },
    });
    const reformer = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    setMockUser({ id: admin.id, role: "ADMIN", email: admin.email, isActive: true, clientProfile: null });
    return { admin, clientUser, clientProfile, trainer, reformer };
  }

  async function makeSession(reformerId: string, trainerId: string, offsetDays: number) {
    const startsAt = new Date(nowMs() + offsetDays * 24 * 60 * 60 * 1000);
    return prisma.session.create({
      data: {
        classTypeId: reformerId,
        trainerUserId: trainerId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
      },
    });
  }

  it("bulk cancel sends ONE summary email per client with the booking count", async () => {
    const { admin, clientProfile, trainer, reformer } = await seedAdminAndClient();
    const bookings = [];
    for (let i = 1; i <= 3; i++) {
      const s = await makeSession(reformer.id, trainer.id, i + 6);
      bookings.push(
        await prisma.booking.create({
          data: { sessionId: s.id, clientProfileId: clientProfile.id, createdByUserId: admin.id },
        }),
      );
    }
    const req = new Request("http://test.local/api/admin/reservations/cancel-bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingIds: bookings.map((b) => b.id) }),
    });
    const res = await cancelBulkPOST(req);
    expect(res.status).toBe(200);
    await waitFor(() => sendSpy.mock.calls.length >= 1);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const arg = sendSpy.mock.calls[0][0];
    expect(arg.to).toBe("klijent@test.local");
    expect(arg.lines.join(" ")).toContain("3");
  });

  it("bulk cancel suppresses the email when bookingEmailsEnabled=false but still logs in-app", async () => {
    const { admin, clientProfile, trainer, reformer } = await seedAdminAndClient({ bookingEmailsEnabled: false });
    const s = await makeSession(reformer.id, trainer.id, 7);
    const booking = await prisma.booking.create({
      data: { sessionId: s.id, clientProfileId: clientProfile.id, createdByUserId: admin.id },
    });
    const req = new Request("http://test.local/api/admin/reservations/cancel-bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingIds: [booking.id] }),
    });
    await cancelBulkPOST(req);
    // The in-app fan-out is the completion signal: once the trainer log exists
    // the post-response block has run, so a still-empty sendSpy proves the
    // email was suppressed (not merely not-yet-fired).
    await waitFor(
      async () => (await prisma.notificationLog.count({ where: { userId: trainer.id } })) > 0,
    );

    expect(sendSpy).not.toHaveBeenCalled();
    const trainerLogs = await prisma.notificationLog.count({ where: { userId: trainer.id } });
    expect(trainerLogs).toBeGreaterThan(0);
  });
});

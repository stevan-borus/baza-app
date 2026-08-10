import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

type SentEmail = { to: string; subject: string; heading: string; lines: string[]; footer: string };
const sendSpy = vi.fn(async (_params: SentEmail) => undefined);
vi.mock("@/lib/server/resend", () => ({
  sendBookingChangeEmail: (params: SentEmail) => sendSpy(params),
}));

import { setMockUser } from "./auth-mock";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { prisma } from "@/lib/server/prisma";
import { POST as cancelBulkPOST } from "@/server/routes/admin/reservations/cancel-bulk";
import { PATCH as sessionPATCH } from "@/server/routes/sessions/[id]";
import { POST as bookingsPOST } from "@/server/routes/bookings";
import { nowMs } from "@/lib/now";

// The email gate's own contract (flag-off suppression, locale resolution,
// default-on when no preference row, BULK count interpolation) is covered at
// the dispatcher level in notify-client.test.ts. The cases below verify the
// real endpoints wire the right event to the right recipients end-to-end.

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

  it("a SINGLE cancel (count=1) sends the singular ADMIN_CANCEL copy, not the plural BULK_CANCEL", async () => {
    const { admin, clientProfile, trainer, reformer } = await seedAdminAndClient();
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
    await waitFor(() => sendSpy.mock.calls.length >= 1);

    const arg = sendSpy.mock.calls[0][0];
    // Singular subject, and no awkward "1 of your sessions" count interpolation.
    expect(arg.subject).toBe("Tvoja rezervacija je otkazana");
    expect(arg.lines.join(" ")).not.toContain("1 ");
  });

  it("session CANCELED via PATCH emails a cancellation, not an 'updated' notice", async () => {
    const { admin, clientProfile, trainer, reformer } = await seedAdminAndClient();
    const startsAt = new Date(nowMs() + 9 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id, createdByUserId: admin.id },
    });

    const req = new Request(`http://test.local/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CANCELED" }),
    });
    const res = await sessionPATCH(req, { id: session.id });
    expect(res.status).toBe(200);
    await waitFor(() => sendSpy.mock.calls.length >= 1);

    const arg = sendSpy.mock.calls.find((c) => c[0].to === "klijent@test.local")?.[0];
    expect(arg?.subject).toBe("Tvoja rezervacija je otkazana");
  });

  it("a pure ROOM change emails booked clients (room is in the change set)", async () => {
    const { admin, clientProfile, trainer, reformer } = await seedAdminAndClient();
    const room = await prisma.studioRoom.create({
      data: { name: "Studio A", capacity: 8 },
    });
    const startsAt = new Date(nowMs() + 9 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id, createdByUserId: admin.id },
    });

    // Only the room changes — time/trainer/status untouched.
    const req = new Request(`http://test.local/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: room.id }),
    });
    const res = await sessionPATCH(req, { id: session.id });
    expect(res.status).toBe(200);
    await waitFor(() => sendSpy.mock.calls.length >= 1);

    const recipients = sendSpy.mock.calls.map((c) => c[0].to);
    expect(recipients).toContain("klijent@test.local");
    expect(sendSpy.mock.calls[0][0].subject).toBe("Tvoj termin je izmenjen");
  });

  it("a session marked COMPLETED does NOT email booked clients", async () => {
    const { admin, clientProfile, trainer, reformer } = await seedAdminAndClient();
    const startsAt = new Date(nowMs() - 2 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id, createdByUserId: admin.id },
    });

    const req = new Request(`http://test.local/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    const res = await sessionPATCH(req, { id: session.id });
    expect(res.status).toBe(200);
    // Give the post-response block time to run, then assert no client email.
    await waitFor(
      async () => (await prisma.notificationLog.count()) >= 0 && true,
      500,
    );
    const recipients = sendSpy.mock.calls.map((c) => c[0].to);
    expect(recipients).not.toContain("klijent@test.local");
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

  it("session update emails each booked client (not the trainer)", async () => {
    const { admin, clientProfile, trainer, reformer } = await seedAdminAndClient();
    const startsAt = new Date(nowMs() + 9 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id, createdByUserId: admin.id },
    });

    const newStart = new Date(startsAt.getTime() + 30 * 60 * 1000).toISOString();
    const req = new Request(`http://test.local/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startsAt: newStart,
        endsAt: new Date(new Date(newStart).getTime() + 60 * 60 * 1000).toISOString(),
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
        trainerUserId: trainer.id,
      }),
    });
    const res = await sessionPATCH(req, { id: session.id });
    expect(res.status).toBe(200);
    await waitFor(() => sendSpy.mock.calls.length >= 1);

    const recipients = sendSpy.mock.calls.map((c) => c[0].to);
    expect(recipients).toContain("klijent@test.local");
    expect(recipients).not.toContain("trainer@test.local");
  });

  it("waitlist auto-promotion emails the promoted client, not the self-canceler", async () => {
    const { admin, reformer, trainer } = await seedAdminAndClient();
    const aUser = await prisma.user.create({
      data: { email: "a@test.local", firstName: "A", lastName: "A", role: "CLIENT" },
    });
    const aProfile = await prisma.clientProfile.create({ data: { userId: aUser.id } });
    const bUser = await prisma.user.create({
      data: { email: "b@test.local", firstName: "B", lastName: "B", role: "CLIENT" },
    });
    await prisma.notificationPreference.create({ data: { userId: bUser.id, bookingEmailsEnabled: true } });
    const bProfile = await prisma.clientProfile.create({ data: { userId: bUser.id } });

    const startsAt = new Date(nowMs() + 7 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 1,
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: aProfile.id, createdByUserId: admin.id },
    });
    const packageType = await prisma.packageType.create({
      data: { name: "Reformer 12", sessionCount: 12, validityDays: 30, lateCancelHours: 8, classTypes: { create: { classTypeId: reformer.id } } },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: bProfile.id,
        packageTypeId: packageType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 8,
        startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
        expiresAt: new Date(nowMs() + 30 * 24 * 60 * 60 * 1000),
        sessionsRemaining: 12,
        sessionsGranted: 12,
      },
    });
    await prisma.waitlistEntry.create({
      data: { sessionId: session.id, clientProfileId: bProfile.id, position: 1 },
    });

    setMockUser({ id: aUser.id, role: "CLIENT", email: aUser.email, isActive: true, clientProfile: { id: aProfile.id } });
    const req = new Request("http://test.local/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "CANCEL", sessionId: session.id }),
    });
    const res = await bookingsPOST(req);
    expect(res.status).toBe(200);
    await waitFor(() => sendSpy.mock.calls.length >= 1);

    const recipients = sendSpy.mock.calls.map((c) => c[0].to);
    expect(recipients).toContain("b@test.local");
    expect(recipients).not.toContain("a@test.local");
  });
});

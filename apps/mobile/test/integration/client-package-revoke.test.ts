/**
 * Keep-the-trace package revoke (POST /api/packages/client-packages/[id]/revoke).
 *
 * Product decision under test: when a pay-later client never shows up to
 * pay, the admin revokes the package. One transaction must:
 *   - stamp ClientPackage.revokedAt (row survives — no delete),
 *   - cancel FUTURE bookings backed by the package WITHOUT a late-cancel
 *     forfeit (no SessionConsumption, no sessionsRemaining decrement),
 *   - leave PAST bookings/attendance untouched ("attended N, never paid"),
 *   - release the client's waitlist seats for future sessions of the class
 *     type UNLESS another live package still backs them,
 *   - flip the linked BillingRecord to VOIDED (only while PENDING — money
 *     already CONFIRMED stays in the books) but keep the row.
 * After the transaction, freed seats promote the next waitlisted client —
 * same post-commit promotion the normal cancel path runs.
 * Afterwards the package grants nothing: booking against it must 409.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";
import { nowMs } from "@/lib/now";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST as POST_REVOKE } from "@/server/routes/packages/client-packages/[id]/revoke";
import { GET as GET_CLIENT_PACKAGES } from "@/server/routes/packages/client-packages";
import { POST as POST_BOOKINGS } from "@/server/routes/bookings";
import { prisma } from "@/lib/server/prisma";
import { createSystemNotification } from "@/lib/server/notifications";

const createSystemNotificationMock = vi.mocked(createSystemNotification);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function seed() {
  const adminUser = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const trainerUser = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "User", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: clientUser.id, dateOfBirth: new Date("1990-01-01") },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 8",
      sessionCount: 8,
      validityDays: 60,
      lateCancelHours: 12,
      price: 24000,
      classTypes: { create: { classTypeId: classType.id } },
    },
  });
  return { adminUser, trainerUser, clientUser, clientProfile, classType, packageType };
}

async function createPackageWithPendingBilling(
  seeded: Awaited<ReturnType<typeof seed>>,
  opts?: { sessionsRemaining?: number },
) {
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: seeded.clientProfile.id,
      packageTypeId: seeded.packageType.id,
      classTypes: { create: { classTypeId: seeded.classType.id } },
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - DAY),
      expiresAt: new Date(nowMs() + 60 * DAY),
      sessionsRemaining: opts?.sessionsRemaining ?? 6,
    },
  });
  const billing = await prisma.billingRecord.create({
    data: {
      clientUserId: seeded.clientUser.id,
      amount: 24000,
      method: "CASH",
      status: "PENDING",
      packageTypeId: seeded.packageType.id,
      clientPackageId: pkg.id,
    },
  });
  return { pkg, billing };
}

async function createSession(
  seeded: Awaited<ReturnType<typeof seed>>,
  startsAt: Date,
  capacity = 6,
) {
  return prisma.session.create({
    data: {
      classTypeId: seeded.classType.id,
      trainerUserId: seeded.trainerUser.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      capacity,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

function revokeRequest(id: string) {
  return new Request(
    `http://test.local/api/packages/client-packages/${id}/revoke`,
    { method: "POST" },
  );
}

function asAdmin(seeded: Awaited<ReturnType<typeof seed>>) {
  setMockUser({
    id: seeded.adminUser.id,
    role: "ADMIN",
    email: seeded.adminUser.email,
    isActive: true,
    clientProfile: null,
  });
}

function asClient(seeded: Awaited<ReturnType<typeof seed>>) {
  setMockUser({
    id: seeded.clientUser.id,
    role: "CLIENT",
    email: seeded.clientUser.email,
    isActive: true,
    clientProfile: { id: seeded.clientProfile.id },
  });
}

describe("POST /api/packages/client-packages/[id]/revoke", () => {
  beforeEach(async () => {
    await resetDb();
    createSystemNotificationMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("cancels only FUTURE bookings, voids PENDING billing, keeps past attendance and the session counter", async () => {
    const seeded = await seed();
    const { pkg, billing } = await createPackageWithPendingBilling(seeded);

    const pastSession = await createSession(seeded, new Date(nowMs() - 2 * DAY));
    const futureSession = await createSession(seeded, new Date(nowMs() + 2 * DAY));
    const pastBooking = await prisma.booking.create({
      data: {
        sessionId: pastSession.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    const futureBooking = await prisma.booking.create({
      data: {
        sessionId: futureSession.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    // Waitlist seat on another future session of the same class type, with
    // no other package to back it — must be released.
    const waitlistSession = await createSession(seeded, new Date(nowMs() + 3 * DAY));
    await prisma.waitlistEntry.create({
      data: {
        sessionId: waitlistSession.id,
        clientProfileId: seeded.clientProfile.id,
        position: 1,
      },
    });

    asAdmin(seeded);
    const res = await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canceledFutureBookings).toBe(1);
    expect(body.removedWaitlistEntries).toBe(1);
    expect(body.billingRecordVoided).toBe(true);
    expect(body.clientPackage.revokedAt).toBeTruthy();

    const [pkgAfter, pastAfter, futureAfter, billingAfter, consumptions, waitlistAfter] =
      await Promise.all([
        prisma.clientPackage.findUnique({ where: { id: pkg.id } }),
        prisma.booking.findUnique({ where: { id: pastBooking.id } }),
        prisma.booking.findUnique({ where: { id: futureBooking.id } }),
        prisma.billingRecord.findUnique({ where: { id: billing.id } }),
        prisma.sessionConsumption.count({
          where: { clientProfileId: seeded.clientProfile.id },
        }),
        prisma.waitlistEntry.count({
          where: { clientProfileId: seeded.clientProfile.id },
        }),
      ]);

    expect(pkgAfter?.revokedAt).not.toBeNull();
    // Keep the trace: the row survives with its counter frozen.
    expect(pkgAfter?.sessionsRemaining).toBe(6);
    // Past attendance untouched; future booking canceled without forfeit.
    expect(pastAfter?.canceledAt).toBeNull();
    expect(futureAfter?.canceledAt).not.toBeNull();
    expect(consumptions).toBe(0);
    // Billing row kept, just voided.
    expect(billingAfter?.status).toBe("VOIDED");
    expect(waitlistAfter).toBe(0);
  });

  it("keeps a CONFIRMED billing record CONFIRMED — revoke must not rewrite received money", async () => {
    const seeded = await seed();
    const { pkg, billing } = await createPackageWithPendingBilling(seeded);
    await prisma.billingRecord.update({
      where: { id: billing.id },
      data: { status: "CONFIRMED" },
    });
    const futureSession = await createSession(seeded, new Date(nowMs() + 2 * DAY));
    const futureBooking = await prisma.booking.create({
      data: {
        sessionId: futureSession.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asAdmin(seeded);
    const res = await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billingRecordVoided).toBe(false);
    expect(body.canceledFutureBookings).toBe(1);

    const [pkgAfter, bookingAfter, billingAfter] = await Promise.all([
      prisma.clientPackage.findUnique({ where: { id: pkg.id } }),
      prisma.booking.findUnique({ where: { id: futureBooking.id } }),
      prisma.billingRecord.findUnique({ where: { id: billing.id } }),
    ]);
    expect(pkgAfter?.revokedAt).not.toBeNull();
    expect(bookingAfter?.canceledAt).not.toBeNull();
    // The money was actually received — it stays in the books.
    expect(billingAfter?.status).toBe("CONFIRMED");
  });

  it("promotes the next waitlisted client on a session freed by the revoke", async () => {
    const seeded = await seed();
    const { pkg } = await createPackageWithPendingBilling(seeded);

    // A second client, waitlisted on the session the revoked client will
    // vacate, holding their own live package to back the promotion.
    const otherUser = await prisma.user.create({
      data: { email: "other@test.local", firstName: "Other", lastName: "Client", role: "CLIENT" },
    });
    const otherProfile = await prisma.clientProfile.create({
      data: { userId: otherUser.id, dateOfBirth: new Date("1992-01-01") },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: otherProfile.id,
        packageTypeId: seeded.packageType.id,
        classTypes: { create: { classTypeId: seeded.classType.id } },
        lateCancelHours: 12,
        startsAt: new Date(nowMs() - DAY),
        expiresAt: new Date(nowMs() + 60 * DAY),
        sessionsRemaining: 5,
      },
    });

    // Full session: revoked client holds the only seat, other client waits.
    const fullSession = await createSession(seeded, new Date(nowMs() + 2 * DAY), 1);
    await prisma.booking.create({
      data: {
        sessionId: fullSession.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });
    await prisma.waitlistEntry.create({
      data: {
        sessionId: fullSession.id,
        clientProfileId: otherProfile.id,
        position: 1,
      },
    });

    asAdmin(seeded);
    const res = await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(200);

    // The freed seat goes to the waitlisted client, not to nobody.
    const promotedBooking = await prisma.booking.findUnique({
      where: {
        sessionId_clientProfileId: {
          sessionId: fullSession.id,
          clientProfileId: otherProfile.id,
        },
      },
    });
    expect(promotedBooking).not.toBeNull();
    expect(promotedBooking?.canceledAt).toBeNull();
    expect(
      await prisma.waitlistEntry.count({ where: { sessionId: fullSession.id } }),
    ).toBe(0);
  });

  it("refuses a CLIENT-role caller (403)", async () => {
    const seeded = await seed();
    const { pkg } = await createPackageWithPendingBilling(seeded);
    asClient(seeded);

    const res = await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(403);

    const after = await prisma.clientPackage.findUnique({ where: { id: pkg.id } });
    expect(after?.revokedAt).toBeNull();
  });

  it("a revoked package no longer grants booking rights", async () => {
    const seeded = await seed();
    const { pkg } = await createPackageWithPendingBilling(seeded);
    asAdmin(seeded);
    await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });

    const session = await createSession(seeded, new Date(nowMs() + DAY));
    asClient(seeded);
    const bookRes = await POST_BOOKINGS(
      new Request("http://test.local/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, action: "BOOK" }),
      }),
    );
    expect(bookRes.status).toBe(409);
    const bookBody = await bookRes.json();
    expect(bookBody.error).toBe("no_package_for_class");
  });

  it("keeps a waitlist seat that another live package still backs", async () => {
    const seeded = await seed();
    const { pkg } = await createPackageWithPendingBilling(seeded);
    // Second, independent live package for the same class type.
    await prisma.clientPackage.create({
      data: {
        clientProfileId: seeded.clientProfile.id,
        packageTypeId: seeded.packageType.id,
        classTypes: { create: { classTypeId: seeded.classType.id } },
        lateCancelHours: 12,
        startsAt: new Date(nowMs() - DAY),
        expiresAt: new Date(nowMs() + 60 * DAY),
        sessionsRemaining: 4,
      },
    });
    const waitlistSession = await createSession(seeded, new Date(nowMs() + 2 * DAY));
    await prisma.waitlistEntry.create({
      data: {
        sessionId: waitlistSession.id,
        clientProfileId: seeded.clientProfile.id,
        position: 1,
      },
    });

    asAdmin(seeded);
    const res = await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removedWaitlistEntries).toBe(0);
    expect(
      await prisma.waitlistEntry.count({
        where: { clientProfileId: seeded.clientProfile.id },
      }),
    ).toBe(1);
  });

  it("refuses a second revoke (409) and unknown ids (404)", async () => {
    const seeded = await seed();
    const { pkg } = await createPackageWithPendingBilling(seeded);
    asAdmin(seeded);

    expect((await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id })).status).toBe(200);
    expect((await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id })).status).toBe(409);

    const missing = "00000000-0000-0000-0000-000000000000";
    expect((await POST_REVOKE(revokeRequest(missing), { id: missing })).status).toBe(404);
  });

  it("the CLIENT-branch payload never advertises a revoked package as bookable", async () => {
    // The bug: the client home/profile picked the active package purely on
    // sessionsRemaining/expiresAt, and the endpoint returned a positive
    // `bookable` for the revoked (but still credited, unexpired) row — so the
    // card invited taps that the booking gate always 409'd. Post-revoke the
    // CLIENT branch must pin heldCount/bookable to 0 and report no active
    // package, so a revoked-only client reads as lapsed.
    const seeded = await seed();
    const { pkg } = await createPackageWithPendingBilling(seeded);
    asAdmin(seeded);
    await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });

    asClient(seeded);
    const res = await GET_CLIENT_PACKAGES(
      new Request("http://test.local/api/packages/client-packages"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Keep-the-trace: the revoked row is still present in the payload...
    const row = body.packages.find((p: { id: string }) => p.id === pkg.id);
    expect(row).toBeTruthy();
    expect(typeof row.revokedAt).toBe("string");
    // ...but it grants nothing bookable, even though credits remain unexpired.
    expect(row.sessionsRemaining).toBe(6);
    expect(row.heldCount).toBe(0);
    expect(row.bookable).toBe(0);
    // And it is NOT the active package — a revoked-only client is lapsed.
    expect(body.activePackageId).toBeNull();
  });

  it("per-client admin list marks the package revoked with its VOIDED billing record", async () => {
    const seeded = await seed();
    const { pkg } = await createPackageWithPendingBilling(seeded);
    asAdmin(seeded);
    await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });

    const res = await GET_CLIENT_PACKAGES(
      new Request(
        `http://test.local/api/packages/client-packages?clientProfileId=${seeded.clientProfile.id}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = body.packages.find((p: { id: string }) => p.id === pkg.id);
    expect(row).toBeTruthy();
    expect(typeof row.revokedAt).toBe("string");
    expect(row.billingRecord?.status).toBe("VOIDED");
  });

  it("notifies the revoked client that their package was revoked and future sessions canceled", async () => {
    // The accepted ship-time gap: the revoked client's bookings just vanished
    // with no signal. Post-commit, best-effort, the revoke now sends the client
    // a PACKAGE_REVOKED system notification (neutral copy, GENERAL type — same
    // decoupled type/message-key pattern the package-expiry cron uses).
    const seeded = await seed();
    const { pkg } = await createPackageWithPendingBilling(seeded);
    const futureSession = await createSession(seeded, new Date(nowMs() + 2 * DAY));
    await prisma.booking.create({
      data: {
        sessionId: futureSession.id,
        clientProfileId: seeded.clientProfile.id,
        clientPackageId: pkg.id,
      },
    });

    asAdmin(seeded);
    const res = await POST_REVOKE(revokeRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(200);

    // Targeted at the CLIENT (not the admin who revoked), with the revoke's
    // message key + generic type, carrying the cancelled-booking count.
    const clientCalls = createSystemNotificationMock.mock.calls.filter(
      (call) => call[0] === seeded.clientUser.id && call[1] === "PACKAGE_REVOKED",
    );
    expect(clientCalls).toHaveLength(1);
    expect(clientCalls[0][2]).toBe("GENERAL");
    expect(clientCalls[0][3]).toMatchObject({
      clientPackageId: pkg.id,
      canceledFutureBookings: 1,
    });
    // The admin who performed the revoke is never notified.
    expect(
      createSystemNotificationMock.mock.calls.filter((call) => call[0] === seeded.adminUser.id),
    ).toEqual([]);
  });
});

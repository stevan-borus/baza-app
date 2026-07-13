/**
 * Pay-later billing (BillingStatus.PENDING) + the confirm flow.
 *
 * Product workflow under test: a client whose package expired is away and
 * wants to book their return sessions remotely. The admin assigns a REAL
 * package with "Plaća kasnije" — the BillingRecord lands as PENDING, the
 * ClientPackage activates immediately (bookable from vacation), and the
 * client pays in person at their first session back, at which point the
 * admin confirms the record (PATCH /api/billing/[id], possibly correcting
 * the method).
 *
 * Revenue integrity: /api/reports/summary (the aggregate every Naplata/
 * Izveštaji hero reads) must count ONLY CONFIRMED — never PENDING (not yet
 * money) and never VOIDED (revoked, never paid).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";
import { nowMs } from "@/lib/now";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_BILLING, POST as POST_BILLING } from "@/server/routes/billing";
import { PATCH as PATCH_BILLING } from "@/server/routes/billing/[id]";
import { GET as GET_SUMMARY } from "@/server/routes/reports/summary";
import { POST as POST_BOOKINGS } from "@/server/routes/bookings";
import { GET as GET_CLIENT_PACKAGES } from "@/server/routes/packages/client-packages";
import { prisma } from "@/lib/server/prisma";

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
      classTypeId: classType.id,
    },
  });
  return { adminUser, trainerUser, clientUser, clientProfile, classType, packageType };
}

function billingRequest(body: unknown) {
  return new Request("http://test.local/api/billing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(id: string, body: unknown) {
  return new Request(`http://test.local/api/billing/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function bookingRequest(body: unknown) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Client-own branch: no clientProfileId param — the handler reads the mocked
// CLIENT guard's own profile.
function clientPackagesRequest() {
  return new Request("http://test.local/api/packages/client-packages");
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

describe("pay-later billing (PENDING) + confirm", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("pay-later creates a PENDING record AND an immediately bookable package", async () => {
    const seeded = await seed();
    asAdmin(seeded);

    const res = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 24000,
        method: "CASH",
        status: "PENDING",
        packageTypeId: seeded.packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.payment.status).toBe("PENDING");
    expect(body.clientPackage).not.toBeNull();

    // FK wired inside the same transaction.
    const record = await prisma.billingRecord.findUnique({
      where: { id: body.payment.id },
    });
    expect(record?.clientPackageId).toBe(body.clientPackage.id);

    // The client can book RIGHT AWAY — that's the point of pay-later.
    const session = await prisma.session.create({
      data: {
        classTypeId: seeded.classType.id,
        trainerUserId: seeded.trainerUser.id,
        startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
        endsAt: new Date(nowMs() + 25 * 60 * 60 * 1000),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    asClient(seeded);
    const bookRes = await POST_BOOKINGS(
      bookingRequest({ sessionId: session.id, action: "BOOK" }),
    );
    expect(bookRes.status).toBe(200);
    const bookBody = await bookRes.json();
    expect(bookBody.state).toBe("BOOKED");
  });

  it("GET /api/billing exposes clientPackageId on a package-backed PENDING row — the Naplata void path needs it", async () => {
    // The pending sheet offers "Opozovi paket" only for records that back a
    // package, and hits the revoke endpoint with that package id. So the list
    // payload MUST carry clientPackageId (billingRecordSchema): a package-
    // backed row exposes it, a payment-only row leaves it null.
    const seeded = await seed();
    asAdmin(seeded);

    // Package-backed pay-later row → clientPackageId wired in the same tx.
    const backedRes = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 24000,
        method: "CASH",
        status: "PENDING",
        packageTypeId: seeded.packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    const backed = await backedRes.json();

    // Payment-only confirmed row → no package → clientPackageId null.
    const bareRes = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 3000,
        method: "CASH",
      }),
    );
    const bare = await bareRes.json();

    const listRes = await GET_BILLING(
      new Request("http://test.local/api/billing"),
    );
    expect(listRes.status).toBe(200);
    const list = await listRes.json();

    const backedRow = list.records.find(
      (r: { id: string }) => r.id === backed.payment.id,
    );
    const bareRow = list.records.find(
      (r: { id: string }) => r.id === bare.payment.id,
    );
    expect(backedRow.clientPackageId).toBe(backed.clientPackage.id);
    expect(bareRow.clientPackageId ?? null).toBeNull();
  });

  it("client-packages payload flags paymentPending true pre-confirm, and clears it once confirmed", async () => {
    const seeded = await seed();
    asAdmin(seeded);

    const createRes = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 24000,
        method: "CASH",
        status: "PENDING",
        packageTypeId: seeded.packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    // Pre-confirm: the client's own packages payload must advertise the debt.
    asClient(seeded);
    const beforeRes = await GET_CLIENT_PACKAGES(clientPackagesRequest());
    expect(beforeRes.status).toBe(200);
    const before = await beforeRes.json();
    expect(before.packages).toHaveLength(1);
    expect(before.packages[0].paymentPending).toBe(true);

    // Confirm the payment (paid at the first visit).
    asAdmin(seeded);
    const patchRes = await PATCH_BILLING(
      patchRequest(created.payment.id, { status: "CONFIRMED" }),
      { id: created.payment.id },
    );
    expect(patchRes.status).toBe(200);

    // Post-confirm: paymentPending is false/absent — the debt is settled.
    asClient(seeded);
    const afterRes = await GET_CLIENT_PACKAGES(clientPackagesRequest());
    const after = await afterRes.json();
    expect(after.packages).toHaveLength(1);
    expect(after.packages[0].paymentPending ?? false).toBe(false);
  });

  it("reports summary counts ONLY CONFIRMED — PENDING and VOIDED are excluded", async () => {
    const seeded = await seed();
    asAdmin(seeded);

    // One real (CONFIRMED) payment.
    const confirmedRes = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 5000,
        method: "CASH",
      }),
    );
    expect(confirmedRes.status).toBe(201);

    // One pay-later (PENDING) payment.
    const pendingRes = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 7000,
        method: "CASH",
        status: "PENDING",
      }),
    );
    expect(pendingRes.status).toBe(201);

    // One VOIDED row — only ever written by the revoke transaction, so
    // seed it directly.
    await prisma.billingRecord.create({
      data: {
        clientUserId: seeded.clientUser.id,
        amount: 9000,
        method: "CASH",
        status: "VOIDED",
      },
    });

    const summaryRes = await GET_SUMMARY(
      new Request("http://test.local/api/reports/summary"),
    );
    expect(summaryRes.status).toBe(200);
    const summary = (await summaryRes.json()).summary;
    expect(summary.revenue).toBe(5000);
    expect(summary.totalPayments).toBe(1);
  });

  it("rejects creating a record with status VOIDED", async () => {
    const seeded = await seed();
    asAdmin(seeded);
    const res = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 5000,
        method: "CASH",
        status: "VOIDED",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH confirms a PENDING record — status flips, method can be corrected, revenue moves", async () => {
    const seeded = await seed();
    asAdmin(seeded);

    const createRes = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 24000,
        method: "CASH",
        status: "PENDING",
        packageTypeId: seeded.packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    const created = await createRes.json();

    const patchRes = await PATCH_BILLING(
      patchRequest(created.payment.id, { status: "CONFIRMED", method: "CARD" }),
      { id: created.payment.id },
    );
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.payment.status).toBe("CONFIRMED");
    expect(patched.payment.method).toBe("CARD");

    const summaryRes = await GET_SUMMARY(
      new Request("http://test.local/api/reports/summary"),
    );
    const summary = (await summaryRes.json()).summary;
    expect(summary.revenue).toBe(24000);
    expect(summary.totalPayments).toBe(1);
  });

  it("PATCH refuses a VOIDED record (409) — a revoked payment must never re-enter revenue", async () => {
    const seeded = await seed();
    asAdmin(seeded);

    // VOIDED rows are only ever written by the revoke transaction — seed
    // directly, as the summary test does.
    const voided = await prisma.billingRecord.create({
      data: {
        clientUserId: seeded.clientUser.id,
        amount: 9000,
        method: "CASH",
        status: "VOIDED",
      },
    });

    const res = await PATCH_BILLING(
      patchRequest(voided.id, { status: "CONFIRMED" }),
      { id: voided.id },
    );
    expect(res.status).toBe(409);

    const after = await prisma.billingRecord.findUnique({ where: { id: voided.id } });
    expect(after?.status).toBe("VOIDED");
  });

  it("PATCH refuses a CLIENT-role caller (403)", async () => {
    const seeded = await seed();
    asAdmin(seeded);
    const createRes = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 5000,
        method: "CASH",
        status: "PENDING",
      }),
    );
    const created = await createRes.json();

    asClient(seeded);
    const res = await PATCH_BILLING(
      patchRequest(created.payment.id, { status: "CONFIRMED" }),
      { id: created.payment.id },
    );
    expect(res.status).toBe(403);

    const after = await prisma.billingRecord.findUnique({
      where: { id: created.payment.id },
    });
    expect(after?.status).toBe("PENDING");
  });

  it("PATCH refuses non-PENDING records (409) and unknown ids (404)", async () => {
    const seeded = await seed();
    asAdmin(seeded);

    const createRes = await POST_BILLING(
      billingRequest({
        clientUserId: seeded.clientUser.id,
        amount: 5000,
        method: "CASH",
      }),
    );
    const created = await createRes.json();

    const conflictRes = await PATCH_BILLING(
      patchRequest(created.payment.id, { status: "CONFIRMED" }),
      { id: created.payment.id },
    );
    expect(conflictRes.status).toBe(409);

    const missingId = "00000000-0000-0000-0000-000000000000";
    const missingRes = await PATCH_BILLING(
      patchRequest(missingId, { status: "CONFIRMED" }),
      { id: missingId },
    );
    expect(missingRes.status).toBe(404);
  });
});

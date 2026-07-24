/**
 * Admin "+1 termin" (POST /api/packages/client-packages/[id]/add-session).
 *
 * Product decision under test: a justified absence already cost the client a
 * session (the no-show charge debits sessionsRemaining at consumption time).
 * The admin restores exactly that one session by incrementing sessionsRemaining
 * by 1 on the still-active package — no throwaway 1-session package needed.
 *
 * Guards, in order:
 *   - package exists → else 404
 *   - not revoked and not expired → else 409 (an expired/dead package can't
 *     absorb a useful credit; rejecting keeps the admin from believing it
 *     worked). ADMIN only (a goodwill credit is an owner decision).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";
import { nowMs } from "@/lib/now";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { POST as POST_ADD_SESSION } from "@/server/routes/packages/client-packages/[id]/add-session";
import { prisma } from "@/lib/server/prisma";

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

async function createPackage(
  seeded: Awaited<ReturnType<typeof seed>>,
  opts?: { sessionsRemaining?: number; expiresAt?: Date; revokedAt?: Date },
) {
  return prisma.clientPackage.create({
    data: {
      clientProfileId: seeded.clientProfile.id,
      packageTypeId: seeded.packageType.id,
      classTypes: { create: { classTypeId: seeded.classType.id } },
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - DAY),
      expiresAt: opts?.expiresAt ?? new Date(nowMs() + 60 * DAY),
      sessionsRemaining: opts?.sessionsRemaining ?? 3,
      revokedAt: opts?.revokedAt ?? null,
    },
  });
}

function addSessionRequest(id: string) {
  return new Request(
    `http://test.local/api/packages/client-packages/${id}/add-session`,
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

function asTrainer(seeded: Awaited<ReturnType<typeof seed>>) {
  setMockUser({
    id: seeded.trainerUser.id,
    role: "TRAINER",
    email: seeded.trainerUser.email,
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

describe("POST /api/packages/client-packages/[id]/add-session", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("increments sessionsRemaining by exactly 1 and returns the updated package", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded, { sessionsRemaining: 3 });
    asAdmin(seeded);

    const res = await POST_ADD_SESSION(addSessionRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.clientPackage.id).toBe(pkg.id);
    expect(body.clientPackage.sessionsRemaining).toBe(4);

    const after = await prisma.clientPackage.findUnique({ where: { id: pkg.id } });
    expect(after?.sessionsRemaining).toBe(4);
  });

  it("returns 404 for an unknown package id", async () => {
    const seeded = await seed();
    asAdmin(seeded);
    const missing = "00000000-0000-0000-0000-000000000000";

    const res = await POST_ADD_SESSION(addSessionRequest(missing), { id: missing });
    expect(res.status).toBe(404);
  });

  it("returns 409 for a revoked package and does not credit it", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded, {
      sessionsRemaining: 2,
      revokedAt: new Date(nowMs() - HOUR),
    });
    asAdmin(seeded);

    const res = await POST_ADD_SESSION(addSessionRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(409);

    const after = await prisma.clientPackage.findUnique({ where: { id: pkg.id } });
    expect(after?.sessionsRemaining).toBe(2);
  });

  it("returns 409 for an expired package and does not credit it", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded, {
      sessionsRemaining: 2,
      expiresAt: new Date(nowMs() - DAY),
    });
    asAdmin(seeded);

    const res = await POST_ADD_SESSION(addSessionRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(409);

    const after = await prisma.clientPackage.findUnique({ where: { id: pkg.id } });
    expect(after?.sessionsRemaining).toBe(2);
  });

  it("refuses a TRAINER caller (403) — a goodwill credit is an owner decision", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded, { sessionsRemaining: 2 });
    asTrainer(seeded);

    const res = await POST_ADD_SESSION(addSessionRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(403);

    const after = await prisma.clientPackage.findUnique({ where: { id: pkg.id } });
    expect(after?.sessionsRemaining).toBe(2);
  });

  it("refuses a CLIENT caller (403)", async () => {
    const seeded = await seed();
    const pkg = await createPackage(seeded, { sessionsRemaining: 2 });
    asClient(seeded);

    const res = await POST_ADD_SESSION(addSessionRequest(pkg.id), { id: pkg.id });
    expect(res.status).toBe(403);
  });
});

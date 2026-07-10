import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/sessions/[id]";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

async function seedAdminSessionWithBookings() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 6 },
  });
  const trainer = await prisma.user.create({
    data: { email: "t@test.local", firstName: "Trainer", lastName: "T", role: "TRAINER" },
  });
  const startsAt = new Date(now().getTime() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt,
      endsAt,
      capacity: 6,
    },
  });
  const pkgType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  const ana = await prisma.user.create({
    data: { email: "ana@test.local", firstName: "Ana", lastName: "Anić", role: "CLIENT" },
  });
  const anaProfile = await prisma.clientProfile.create({ data: { userId: ana.id } });
  const anaPkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: anaProfile.id,
      packageTypeId: pkgType.id,
      classTypeId: reformer.id,
      lateCancelHours: 12,
      startsAt: now(),
      expiresAt: new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000),
      sessionsRemaining: 12,
    },
  });
  await prisma.booking.create({
    data: {
      clientProfileId: anaProfile.id,
      sessionId: session.id,
      clientPackageId: anaPkg.id,
    },
  });
  return { admin, session, ana, reformer, anaProfile };
}

/**
 * Adds a waitlisted client to an existing session at the given position.
 * Waitlist entries don't consume a package (they aren't booked yet), so this
 * only needs a client profile + the WaitlistEntry row.
 */
async function seedWaitlistEntry(
  sessionId: string,
  position: number,
  email: string,
  fullName: string,
) {
  const [firstName, ...rest] = fullName.split(" ");
  const lastName = rest.join(" ") || "Test";
  const user = await prisma.user.create({
    data: { email, firstName, lastName, role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({ data: { userId: user.id } });
  await prisma.waitlistEntry.create({
    data: { sessionId, clientProfileId: profile.id, position },
  });
  return { user, profile };
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

describe("GET /api/sessions/[id]", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns session details + bookings with client name", async () => {
    const { admin, session, ana } = await seedAdminSessionWithBookings();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.session.id).toBe(session.id);
    expect(body.session.bookings).toHaveLength(1);
    expect(body.session.bookings[0].client.fullName).toBe(
      `${ana.firstName} ${ana.lastName}`,
    );
  });

  it("returns waitlisted clients in position order under session.waitlist", async () => {
    const { admin, session } = await seedAdminSessionWithBookings();
    // Insert out of order to prove the endpoint sorts by position.
    await seedWaitlistEntry(session.id, 2, "wl2@test.local", "Waitlist Two");
    await seedWaitlistEntry(session.id, 1, "wl1@test.local", "Waitlist One");
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const body = await response.json();
    expect(body.session.waitlist).toHaveLength(2);
    expect(body.session.waitlist.map((w: { position: number }) => w.position)).toEqual([1, 2]);
    expect(body.session.waitlist[0].client.fullName).toBe("Waitlist One");
    expect(body.session.waitlist[0].client.email).toBe("wl1@test.local");
  });

  it("returns an empty waitlist array when no one is queued", async () => {
    const { admin, session } = await seedAdminSessionWithBookings();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const body = await response.json();
    expect(body.session.waitlist).toEqual([]);
  });

  it("carries consentFlags on each waitlist entry, same shape as bookings", async () => {
    const { admin, session } = await seedAdminSessionWithBookings();
    await seedWaitlistEntry(session.id, 1, "wl1@test.local", "Waitlist One");
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const body = await response.json();
    const entry = body.session.waitlist[0];
    expect(entry.consentFlags).toMatchObject({
      intakeRecorded: expect.any(Boolean),
      intakeWithdrawn: expect.any(Boolean),
      conditions: expect.any(Array),
      socialMediaAccepted: null,
    });
    expect(entry.client.id).toBeDefined();
  });

  it("404s for unknown session id", async () => {
    const { admin } = await seedAdminSessionWithBookings();
    asAdmin(admin);
    const response = await GET(
      new Request("http://test.local/api/sessions/nonexistent"),
      { id: "nonexistent" },
    );
    expect(response.status).toBe(404);
  });
});

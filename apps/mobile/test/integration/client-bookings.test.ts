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

import { GET } from "@/app/api/clients/[id]/bookings/+api";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeClient(opts: { email: string; fullName: string }) {
  const [firstName, ...rest] = opts.fullName.split(" ");
  const lastName = rest.join(" ") || "Test";
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      firstName,
      lastName,
      role: "CLIENT",
      isActive: true,
    },
  });
  const profile = await prisma.clientProfile.create({ data: { userId: user.id } });
  return { user, profile };
}

async function makeTrainer(opts: { email: string; fullName: string }) {
  const [firstName, ...rest] = opts.fullName.split(" ");
  const lastName = rest.join(" ") || "Test";
  return prisma.user.create({
    data: { email: opts.email, firstName, lastName, role: "TRAINER" },
  });
}

async function makeReformer() {
  return prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
}

async function makeSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAt: Date;
  durationMs?: number;
}) {
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      startsAt: opts.startsAt,
      endsAt: new Date(opts.startsAt.getTime() + (opts.durationMs ?? 60 * 60 * 1000)),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
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

function asTrainer(id: string) {
  setMockUser({
    id,
    role: "TRAINER",
    email: "trainer@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function asClient(opts: { id: string; clientProfileId: string }) {
  setMockUser({
    id: opts.id,
    role: "CLIENT",
    email: "client-self@test.local",
    isActive: true,
    clientProfile: { id: opts.clientProfileId },
  });
}

function buildRequest(clientUserId: string, qs: string = "") {
  return new Request(
    `http://test.local/api/clients/${clientUserId}/bookings${qs ? `?${qs}` : ""}`,
  );
}

describe("GET /api/clients/[id]/bookings", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("admin sees upcoming bookings for a client", async () => {
    const classType = await makeReformer();
    const trainer = await makeTrainer({
      email: "trainer-up@test.local",
      fullName: "Trainer Up",
    });
    const { user: client, profile } = await makeClient({
      email: "client-up@test.local",
      fullName: "Up Client",
    });
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 2 * DAY_MS),
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profile.id },
    });

    asAdmin();
    const res = await GET(buildRequest(client.id, "period=upcoming"), {
      id: client.id,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].status).toBe("CONFIRMED");
    expect(body.bookings[0].session.id).toBe(session.id);
    expect(body.bookings[0].session.classType.name).toBe("Reformer");
    expect(body.bookings[0].session.trainer?.fullName).toBe("Trainer Up");
    expect(body.nextCursor).toBeNull();
  });

  it("admin sees past bookings for a client (includes canceled ones)", async () => {
    const classType = await makeReformer();
    const trainer = await makeTrainer({
      email: "trainer-past@test.local",
      fullName: "Trainer Past",
    });
    const { user: client, profile } = await makeClient({
      email: "client-past@test.local",
      fullName: "Past Client",
    });

    const pastSession = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() - 3 * DAY_MS),
    });
    await prisma.booking.create({
      data: { sessionId: pastSession.id, clientProfileId: profile.id },
    });
    // A future session that was canceled — also belongs in "past" because
    // canceledAt is not null.
    const futureCanceledSession = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 5 * DAY_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: futureCanceledSession.id,
        clientProfileId: profile.id,
        canceledAt: new Date(nowMs() - 1 * DAY_MS),
      },
    });

    asAdmin();
    const res = await GET(buildRequest(client.id, "period=past"), {
      id: client.id,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings).toHaveLength(2);
    const statuses = body.bookings.map((b: { status: string }) => b.status).sort();
    expect(statuses).toEqual(["CANCELED", "CONFIRMED"]);
  });

  it("upcoming list excludes past + canceled bookings", async () => {
    const classType = await makeReformer();
    const trainer = await makeTrainer({
      email: "trainer-mix@test.local",
      fullName: "Trainer Mix",
    });
    const { user: client, profile } = await makeClient({
      email: "client-mix@test.local",
      fullName: "Mix Client",
    });
    const upcoming = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 2 * DAY_MS),
    });
    await prisma.booking.create({
      data: { sessionId: upcoming.id, clientProfileId: profile.id },
    });
    const past = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() - 2 * DAY_MS),
    });
    await prisma.booking.create({
      data: { sessionId: past.id, clientProfileId: profile.id },
    });
    const upcomingCanceled = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 3 * DAY_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: upcomingCanceled.id,
        clientProfileId: profile.id,
        canceledAt: new Date(nowMs() - 1 * 60 * 60 * 1000),
      },
    });

    asAdmin();
    const res = await GET(buildRequest(client.id, "period=upcoming"), {
      id: client.id,
    });
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].session.id).toBe(upcoming.id);
  });

  it("trainer linked to client gets 200 with their booking", async () => {
    const classType = await makeReformer();
    const trainer = await makeTrainer({
      email: "trainer-linked@test.local",
      fullName: "Linked Trainer",
    });
    const { user: client, profile } = await makeClient({
      email: "linked-client@test.local",
      fullName: "Linked Client",
    });
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 1 * DAY_MS),
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profile.id },
    });

    asTrainer(trainer.id);
    const res = await GET(buildRequest(client.id, "period=upcoming"), {
      id: client.id,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].session.trainer?.id).toBe(trainer.id);
  });

  it("trainer NOT linked to client gets 403", async () => {
    const otherTrainer = await makeTrainer({
      email: "trainer-other@test.local",
      fullName: "Other Trainer",
    });
    const { user: client } = await makeClient({
      email: "stranger@test.local",
      fullName: "Stranger",
    });

    asTrainer(otherTrainer.id);
    const res = await GET(buildRequest(client.id, "period=upcoming"), {
      id: client.id,
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when period is missing or invalid", async () => {
    const { user: client } = await makeClient({
      email: "bad-period@test.local",
      fullName: "Bad",
    });
    asAdmin();
    const noPeriod = await GET(buildRequest(client.id), { id: client.id });
    expect(noPeriod.status).toBe(400);
    const wrongPeriod = await GET(buildRequest(client.id, "period=bogus"), {
      id: client.id,
    });
    expect(wrongPeriod.status).toBe(400);
  });

  it("returns 404 when target client does not exist", async () => {
    asAdmin();
    const res = await GET(
      buildRequest("00000000-0000-0000-0000-000000000000", "period=upcoming"),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(res.status).toBe(404);
  });

  it("paginates: limit=2 with 3 bookings returns cursor + page 1; page 2 closes the cursor", async () => {
    const classType = await makeReformer();
    const trainer = await makeTrainer({
      email: "trainer-page@test.local",
      fullName: "Page Trainer",
    });
    const { user: client, profile } = await makeClient({
      email: "page-client@test.local",
      fullName: "Page Client",
    });

    // Three upcoming sessions at distinct times so order is deterministic.
    const sessions = [];
    for (let i = 0; i < 3; i++) {
      const s = await makeSession({
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: new Date(nowMs() + (i + 1) * DAY_MS),
      });
      await prisma.booking.create({
        data: { sessionId: s.id, clientProfileId: profile.id },
      });
      sessions.push(s);
    }

    asAdmin();
    const page1Res = await GET(
      buildRequest(client.id, "period=upcoming&limit=2"),
      { id: client.id },
    );
    const page1 = await page1Res.json();
    expect(page1.bookings).toHaveLength(2);
    expect(page1.bookings[0].session.id).toBe(sessions[0].id);
    expect(page1.bookings[1].session.id).toBe(sessions[1].id);
    expect(page1.nextCursor).not.toBeNull();

    const page2Res = await GET(
      buildRequest(
        client.id,
        `period=upcoming&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
      ),
      { id: client.id },
    );
    const page2 = await page2Res.json();
    expect(page2.bookings).toHaveLength(1);
    expect(page2.bookings[0].session.id).toBe(sessions[2].id);
    expect(page2.nextCursor).toBeNull();
  });

  it("client can read their OWN past bookings", async () => {
    // Self-access pattern: a client hitting /api/clients/:id/bookings
    // for their own userId gets their data back. This is the only way
    // clients can see their training history after we removed the
    // notes-driven 'Istorija treninga' from the profile (PR #41) — past
    // sessions stay, the notes don't.
    const classType = await makeReformer();
    const trainer = await makeTrainer({
      email: "trainer-self@test.local",
      fullName: "Trainer Self",
    });
    const { user: client, profile } = await makeClient({
      email: "client-self-history@test.local",
      fullName: "Self Client",
    });
    const pastSession = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() - 3 * DAY_MS),
    });
    await prisma.booking.create({
      data: { sessionId: pastSession.id, clientProfileId: profile.id },
    });

    asClient({ id: client.id, clientProfileId: profile.id });
    const res = await GET(buildRequest(client.id, "period=past"), {
      id: client.id,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].session.id).toBe(pastSession.id);
  });

  it("client cannot read SOMEONE ELSE's bookings (403)", async () => {
    // Guard against the obvious IDOR: a client cannot pass another
    // client's userId in the path and read their data.
    const { user: me, profile: myProfile } = await makeClient({
      email: "client-me@test.local",
      fullName: "Me Client",
    });
    const { user: stranger } = await makeClient({
      email: "client-stranger@test.local",
      fullName: "Stranger Client",
    });

    asClient({ id: me.id, clientProfileId: myProfile.id });
    const res = await GET(buildRequest(stranger.id, "period=past"), {
      id: stranger.id,
    });
    expect(res.status).toBe(403);
  });
});

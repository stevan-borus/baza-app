import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/clients";
import { prisma } from "@/lib/server/prisma";

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

async function seedNamedClient(opts: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      role: "CLIENT",
      isActive: true,
    },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id },
  });
  return { user, profile };
}

async function seedClients(count: number) {
  // Stable, predictable, ID-sortable names. We seed with numbered names so
  // the cursor ordering (by clientProfile.id ascending) matches insertion
  // order — that lets us assert exact slices across pages.
  const created: { profileId: string; userId: string; fullName: string }[] = [];
  for (let i = 0; i < count; i++) {
    const idx = String(i + 1).padStart(3, "0");
    const user = await prisma.user.create({
      data: {
        email: `client-${idx}@test.local`,
        firstName: "Client",
        lastName: idx,
        role: "CLIENT",
        isActive: true,
      },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: user.id },
    });
    created.push({
      profileId: profile.id,
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
    });
  }
  return created;
}

type ClientResponse = {
  success: boolean;
  clients: Array<{
    id: string;
    user: { email: string; fullName: string };
  }>;
  nextCursor: string | null;
  total: number;
};

describe("clients API — pagination & search", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("paginates with cursor: take=10 returns first 10 with nextCursor", async () => {
    await seedClients(25);
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?take=10"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClientResponse;
    expect(body.success).toBe(true);
    expect(body.clients).toHaveLength(10);
    expect(body.nextCursor).toBeTruthy();
    expect(typeof body.nextCursor).toBe("string");
    // The cursor we return is the last id on the page.
    expect(body.nextCursor).toBe(body.clients[9].id);
  });

  it("follows cursor to second page", async () => {
    await seedClients(25);
    asAdmin();

    const firstRes = await GET(
      new Request("http://test.local/api/clients?take=10"),
    );
    const firstBody = (await firstRes.json()) as ClientResponse;

    const secondRes = await GET(
      new Request(
        `http://test.local/api/clients?take=10&cursor=${firstBody.nextCursor}`,
      ),
    );
    const secondBody = (await secondRes.json()) as ClientResponse;
    expect(secondBody.clients).toHaveLength(10);
    // No overlap between pages.
    const firstIds = new Set(firstBody.clients.map((c) => c.id));
    for (const c of secondBody.clients) {
      expect(firstIds.has(c.id)).toBe(false);
    }
    expect(secondBody.nextCursor).toBe(secondBody.clients[9].id);
  });

  it("final page returns remaining items and null nextCursor", async () => {
    await seedClients(25);
    asAdmin();

    const r1 = await GET(new Request("http://test.local/api/clients?take=10"));
    const b1 = (await r1.json()) as ClientResponse;
    const r2 = await GET(
      new Request(`http://test.local/api/clients?take=10&cursor=${b1.nextCursor}`),
    );
    const b2 = (await r2.json()) as ClientResponse;
    const r3 = await GET(
      new Request(`http://test.local/api/clients?take=10&cursor=${b2.nextCursor}`),
    );
    const b3 = (await r3.json()) as ClientResponse;
    expect(b3.clients).toHaveLength(5);
    expect(b3.nextCursor).toBeNull();
  });

  it("filters with ?q= by fullName (case-insensitive)", async () => {
    // Seed 25 numbered clients + 1 "Zebra Special" that's easy to target.
    await seedClients(25);
    const targetUser = await prisma.user.create({
      data: {
        email: "zebra@test.local",
        firstName: "Zebra",
        lastName: "Special",
        role: "CLIENT",
        isActive: true,
      },
    });
    await prisma.clientProfile.create({ data: { userId: targetUser.id } });
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?q=zebra"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.fullName).toBe("Zebra Special");
  });

  it("filters with ?q= by email", async () => {
    await seedClients(5);
    asAdmin();
    const res = await GET(
      new Request("http://test.local/api/clients?q=client-003"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.email).toBe("client-003@test.local");
  });

  it("empty q returns first page unfiltered (no q filter applied)", async () => {
    await seedClients(25);
    asAdmin();
    const res = await GET(
      new Request("http://test.local/api/clients?q=&take=20"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(20);
    expect(body.nextCursor).toBeTruthy();
  });

  it("caps take at 100", async () => {
    await seedClients(5);
    asAdmin();
    const res = await GET(
      new Request("http://test.local/api/clients?take=500"),
    );
    expect(res.status).toBe(200);
    // We seeded 5 — capping take at 100 means we still get all 5 here, but
    // crucially the request doesn't 400.
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(5);
    expect(body.nextCursor).toBeNull();
  });

  it("default take is 20 when omitted", async () => {
    await seedClients(25);
    asAdmin();
    const res = await GET(new Request("http://test.local/api/clients"));
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(20);
    expect(body.nextCursor).toBeTruthy();
  });

  it("multi-word q matches across firstName + lastName (full-name search)", async () => {
    // Decoys that share one of the words but not both, so a per-token AND is
    // required to isolate the real match.
    await seedNamedClient({
      email: "active-other@test.local",
      firstName: "Active",
      lastName: "Other",
    });
    await seedNamedClient({
      email: "someone-reformer@test.local",
      firstName: "Someone",
      lastName: "Reformer",
    });
    await seedNamedClient({
      email: "active-reformer@test.local",
      firstName: "Active",
      lastName: "Reformer",
    });
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?q=active%20reformer"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.fullName).toBe("Active Reformer");
  });

  it("multi-word q matches when lastName itself contains a space", async () => {
    await seedNamedClient({
      email: "pagi-007@test.local",
      firstName: "Pagi",
      lastName: "Client 007",
    });
    // Decoy sharing "Client" only.
    await seedNamedClient({
      email: "pagi-008@test.local",
      firstName: "Other",
      lastName: "Client 008",
    });
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?q=Pagi%20Client%20007"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.fullName).toBe("Pagi Client 007");
  });

  it("single-token q still matches by firstName (regression guard)", async () => {
    await seedNamedClient({
      email: "solo@test.local",
      firstName: "Solo",
      lastName: "Person",
    });
    asAdmin();

    const res = await GET(new Request("http://test.local/api/clients?q=solo"));
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.fullName).toBe("Solo Person");
  });

  it("single-token q still matches by email substring (regression guard)", async () => {
    await seedNamedClient({
      email: "client.active@test.local",
      firstName: "Aaa",
      lastName: "Bbb",
    });
    await seedNamedClient({
      email: "unrelated@test.local",
      firstName: "Ccc",
      lastName: "Ddd",
    });
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?q=client.active"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.email).toBe("client.active@test.local");
  });

  it("multi-word q is order-independent", async () => {
    await seedNamedClient({
      email: "ar@test.local",
      firstName: "Active",
      lastName: "Reformer",
    });
    await seedNamedClient({
      email: "ao@test.local",
      firstName: "Active",
      lastName: "Other",
    });
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?q=reformer%20active"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.fullName).toBe("Active Reformer");
  });

  // ── total-count badge ──────────────────────────────────────────────────
  // The Klijenti tab badge must show the FULL matching count, not the number
  // of rows on the current page. Before this field existed the UI derived the
  // count from the loaded pages' length, so it read the page size (20) until
  // the admin scrolled. `total` is a server-side count over the SAME where
  // clause the list uses, so it also follows the q-search filter.

  it("returns total = full matching count, independent of take (page size)", async () => {
    await seedClients(25);
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?take=10"),
    );
    const body = (await res.json()) as ClientResponse;
    // Only 10 rows come back on this page…
    expect(body.clients).toHaveLength(10);
    // …but the total reflects all 25 matching clients.
    expect(body.total).toBe(25);
  });

  it("total counts remaining pages the same (stable across cursor navigation)", async () => {
    await seedClients(25);
    asAdmin();

    const r1 = await GET(new Request("http://test.local/api/clients?take=10"));
    const b1 = (await r1.json()) as ClientResponse;
    const r2 = await GET(
      new Request(`http://test.local/api/clients?take=10&cursor=${b1.nextCursor}`),
    );
    const b2 = (await r2.json()) as ClientResponse;
    // The badge shouldn't change as the user pages through the list.
    expect(b1.total).toBe(25);
    expect(b2.total).toBe(25);
  });

  it("total follows the ?q= search filter", async () => {
    await seedClients(25);
    const targetUser = await prisma.user.create({
      data: {
        email: "zebra@test.local",
        firstName: "Zebra",
        lastName: "Special",
        role: "CLIENT",
        isActive: true,
      },
    });
    await prisma.clientProfile.create({ data: { userId: targetUser.id } });
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?q=zebra"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    // Not 26 — the count respects the active search, matching the visible list.
    expect(body.total).toBe(1);
  });

  it("total excludes soft-deleted (isActive:false) clients", async () => {
    await seedClients(5);
    // Soft-delete one — flips the user's isActive flag, which the list's
    // activeWhere hides. The count must hide it too.
    const inactiveUser = await prisma.user.create({
      data: {
        email: "deleted@test.local",
        firstName: "Deleted",
        lastName: "Client",
        role: "CLIENT",
        isActive: false,
      },
    });
    await prisma.clientProfile.create({ data: { userId: inactiveUser.id } });
    asAdmin();

    const res = await GET(new Request("http://test.local/api/clients"));
    const body = (await res.json()) as ClientResponse;
    expect(body.total).toBe(5);
  });

  it("total is trainer-scoped (only clients linked to the trainer)", async () => {
    const trainer = await prisma.user.create({
      data: {
        email: "trainer-total@test.local",
        firstName: "Trainer",
        lastName: "Total",
        role: "TRAINER",
      },
    });
    const classType = await prisma.classType.create({
      data: { name: "Reformer Total", maxClients: 6, durationMins: 60 },
    });
    const linked = await seedNamedClient({
      email: "linked-total@test.local",
      firstName: "Linked",
      lastName: "Total",
    });
    // Two strangers not linked to this trainer.
    await seedClients(2);
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-05-10T10:00:00Z"),
        endsAt: new Date("2026-05-10T11:00:00Z"),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: linked.profile.id },
    });

    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(new Request("http://test.local/api/clients"));
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    // Strangers don't inflate the count.
    expect(body.total).toBe(1);
  });

  it("trainer-scope still ANDs with a multi-word search (no cross-trainer leak)", async () => {
    const trainer = await prisma.user.create({
      data: {
        email: "trainer-search@test.local",
        firstName: "Trainer",
        lastName: "Search",
        role: "TRAINER",
      },
    });
    const classType = await prisma.classType.create({
      data: { name: "Reformer Search", maxClients: 6, durationMins: 60 },
    });
    // Linked client matching the query.
    const linked = await seedNamedClient({
      email: "linked-ar@test.local",
      firstName: "Active",
      lastName: "Reformer",
    });
    // A stranger that also matches the query but is NOT linked to this trainer.
    await seedNamedClient({
      email: "stranger-ar@test.local",
      firstName: "Active",
      lastName: "Reformer",
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-05-10T10:00:00Z"),
        endsAt: new Date("2026-05-10T11:00:00Z"),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: linked.profile.id },
    });

    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(
      new Request("http://test.local/api/clients?q=active%20reformer"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.email).toBe("linked-ar@test.local");
  });
});

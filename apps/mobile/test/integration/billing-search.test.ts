import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/billing";
import { prisma } from "@/lib/server/prisma";

// Server-side `?q=` search over the Naplata list. The screen previously
// filtered client-side over loaded pages (client.fullName / notes), so a
// search never reached the DB and the filtered totals only covered fetched
// rows. Search now runs in Postgres: each whitespace token must match the
// paying client's firstName/lastName OR the record's notes, tokens ANDed.
// Client name lives on User (BillingRecord has no FK), so name matching
// resolves via clientUserId IN (users matching the token).

async function seed() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const ana = await prisma.user.create({
    data: { email: "ana@test.local", firstName: "Ana", lastName: "Petrovic", role: "CLIENT" },
  });
  const marko = await prisma.user.create({
    data: { email: "marko@test.local", firstName: "Marko", lastName: "Jovanovic", role: "CLIENT" },
  });
  await prisma.billingRecord.create({
    data: { clientUserId: ana.id, amount: 100, method: "CASH", status: "CONFIRMED", notes: "reformer paket" },
  });
  await prisma.billingRecord.create({
    data: { clientUserId: marko.id, amount: 200, method: "CARD", status: "CONFIRMED", notes: "mat paket" },
  });
  return { admin, ana, marko };
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

describe("GET /api/billing — server-side ?q= search", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("matches by paying client's first name (case-insensitive)", async () => {
    const { admin } = await seed();
    asAdmin(admin);
    const res = await GET(new Request("http://test.local/api/billing?q=ana"));
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].client.fullName).toBe("Ana Petrovic");
  });

  it("matches by paying client's last name", async () => {
    const { admin } = await seed();
    asAdmin(admin);
    const res = await GET(new Request("http://test.local/api/billing?q=jovanovic"));
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].client.fullName).toBe("Marko Jovanovic");
  });

  it("matches by record notes", async () => {
    const { admin } = await seed();
    asAdmin(admin);
    const res = await GET(new Request("http://test.local/api/billing?q=reformer"));
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].notes).toBe("reformer paket");
  });

  it("multi-word q matches full name (tokens ANDed across first + last)", async () => {
    const { admin } = await seed();
    // Decoy sharing only the first token.
    const anaOther = await prisma.user.create({
      data: { email: "ana2@test.local", firstName: "Ana", lastName: "Nikolic", role: "CLIENT" },
    });
    await prisma.billingRecord.create({
      data: { clientUserId: anaOther.id, amount: 50, method: "CASH", status: "CONFIRMED" },
    });
    asAdmin(admin);
    const res = await GET(
      new Request("http://test.local/api/billing?q=ana%20petrovic"),
    );
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].client.fullName).toBe("Ana Petrovic");
  });

  it("empty q returns all records (no filter applied)", async () => {
    const { admin } = await seed();
    asAdmin(admin);
    const res = await GET(new Request("http://test.local/api/billing?q="));
    const body = await res.json();
    expect(body.records).toHaveLength(2);
  });
});

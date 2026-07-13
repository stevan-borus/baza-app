import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/billing/summary";
import { prisma } from "@/lib/server/prisma";

// GET /api/billing/summary — filter-wide aggregate for the Naplata hero +
// StatStrip. The regression it guards: the screen summed loaded pages, so
// every figure understated the month until the admin scrolled. The summary
// counts the WHOLE matching set and takes the SAME filters as the list
// (clientUserId, from, to, q), so hero/count/avg stay in sync with the rows.

async function seedMonth() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const ana = await prisma.user.create({
    data: { email: "ana@test.local", firstName: "Ana", lastName: "Petrovic", role: "CLIENT" },
  });
  const marko = await prisma.user.create({
    data: { email: "marko@test.local", firstName: "Marko", lastName: "Jovanovic", role: "CLIENT" },
  });
  // Ana pays twice (300 total), Marko once (200). 3 records, 2 distinct clients,
  // 500 total. All within May 2026.
  const may = (day: number) => new Date(`2026-05-${String(day).padStart(2, "0")}T10:00:00Z`);
  await prisma.billingRecord.create({
    data: { clientUserId: ana.id, amount: 100, method: "CASH", status: "CONFIRMED", notes: "reformer", createdAt: may(3) },
  });
  await prisma.billingRecord.create({
    data: { clientUserId: ana.id, amount: 200, method: "CARD", status: "CONFIRMED", createdAt: may(10) },
  });
  await prisma.billingRecord.create({
    data: { clientUserId: marko.id, amount: 200, method: "CASH", status: "CONFIRMED", createdAt: may(15) },
  });
  return { admin, ana, marko };
}

function asAdmin(admin: { id: string; email: string }) {
  setMockUser({ id: admin.id, role: "ADMIN", email: admin.email, isActive: true, clientProfile: null });
}

const SUMMARY_URL = "http://test.local/api/billing/summary";

describe("GET /api/billing/summary", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns filter-wide totals: revenue, count, distinct clients", async () => {
    const { admin } = await seedMonth();
    asAdmin(admin);
    const res = await GET(new Request(SUMMARY_URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalRevenue).toBe(500);
    expect(body.count).toBe(3);
    expect(body.distinctClients).toBe(2);
  });

  it("follows the from/to window", async () => {
    const { admin } = await seedMonth();
    asAdmin(admin);
    // Window that excludes the May-15 record (Marko, 200).
    const res = await GET(
      new Request(`${SUMMARY_URL}?from=2026-05-01T00:00:00Z&to=2026-05-12T00:00:00Z`),
    );
    const body = await res.json();
    // Only Ana's two records remain: 300 total, 2 count, 1 distinct client.
    expect(body.totalRevenue).toBe(300);
    expect(body.count).toBe(2);
    expect(body.distinctClients).toBe(1);
  });

  it("follows the ?q= search (client name)", async () => {
    const { admin } = await seedMonth();
    asAdmin(admin);
    const res = await GET(new Request(`${SUMMARY_URL}?q=marko`));
    const body = await res.json();
    expect(body.totalRevenue).toBe(200);
    expect(body.count).toBe(1);
    expect(body.distinctClients).toBe(1);
  });

  it("follows the ?q= search (record notes)", async () => {
    const { admin } = await seedMonth();
    asAdmin(admin);
    const res = await GET(new Request(`${SUMMARY_URL}?q=reformer`));
    const body = await res.json();
    expect(body.totalRevenue).toBe(100);
    expect(body.count).toBe(1);
    expect(body.distinctClients).toBe(1);
  });

  it("returns zeros for an empty window (no records)", async () => {
    const { admin } = await seedMonth();
    asAdmin(admin);
    const res = await GET(
      new Request(`${SUMMARY_URL}?from=2026-01-01T00:00:00Z&to=2026-01-31T00:00:00Z`),
    );
    const body = await res.json();
    expect(body.totalRevenue).toBe(0);
    expect(body.count).toBe(0);
    expect(body.distinctClients).toBe(0);
  });

  it("is admin-only (403 for a trainer)", async () => {
    const { admin } = await seedMonth();
    void admin;
    setMockUser({
      id: "trainer-1",
      role: "TRAINER",
      email: "trainer@test.local",
      isActive: true,
      clientProfile: null,
    });
    const res = await GET(new Request(SUMMARY_URL));
    expect(res.status).toBe(403);
  });
});

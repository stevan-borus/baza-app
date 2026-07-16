import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_REVENUE } from "@/server/routes/reports/revenue";
import { GET as GET_SUMMARY } from "@/server/routes/reports/summary";
import { GET as GET_BY_TRAINER } from "@/server/routes/reports/utilization/by-trainer";
import { prisma } from "@/lib/server/prisma";

/**
 * Least-privilege: studio-wide financial + cross-trainer reports are
 * ADMIN-only. A TRAINER must NOT be able to read them (403); ADMIN still 200.
 */
function asAdmin() {
  setMockUser({ id: "admin-1", role: "ADMIN", email: "admin@test.local", isActive: true, clientProfile: null });
}
function asTrainer() {
  setMockUser({ id: "trainer-1", role: "TRAINER", email: "trainer@test.local", isActive: true, clientProfile: null });
}

const TIMEFRAME = "from=2026-04-01T00:00:00Z&to=2026-05-01T00:00:00Z&period=month";

const revenueReq = () =>
  new Request(`http://test.local/api/reports/revenue?${TIMEFRAME}`);
const summaryReq = () => new Request("http://test.local/api/reports/summary");
const byTrainerReq = () =>
  new Request(`http://test.local/api/reports/utilization/by-trainer?${TIMEFRAME}`);

describe("reports least-privilege — TRAINER forbidden, ADMIN allowed", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("reports/revenue is forbidden for TRAINER (403)", async () => {
    asTrainer();
    const res = await GET_REVENUE(revenueReq());
    expect(res.status).toBe(403);
  });

  it("reports/summary is forbidden for TRAINER (403)", async () => {
    asTrainer();
    const res = await GET_SUMMARY(summaryReq());
    expect(res.status).toBe(403);
  });

  it("reports/utilization/by-trainer is forbidden for TRAINER (403)", async () => {
    asTrainer();
    const res = await GET_BY_TRAINER(byTrainerReq());
    expect(res.status).toBe(403);
  });

  it("all three remain 200 for ADMIN", async () => {
    asAdmin();
    expect((await GET_REVENUE(revenueReq())).status).toBe(200);
    expect((await GET_SUMMARY(summaryReq())).status).toBe(200);
    expect((await GET_BY_TRAINER(byTrainerReq())).status).toBe(200);
  });
});

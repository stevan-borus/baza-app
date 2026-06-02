import { describe, it, expect, beforeEach, vi } from "vitest";
import { setMockUser } from "./auth-mock";

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

import { DELETE, POST } from "@/app/api/health-intake+api";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";

const validBody = {
  conditions: [],
  underMedicalTreatment: false,
  pilatesExperience: ["none"],
  activityLevel: "moderate",
  exerciseFrequency: "2-3",
  goals: [],
  discomfortDuring: [],
};

describe("DELETE /api/health-intake — withdraw", () => {
  let clientProfileId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: {
        email: "withdraw@t.local",
        firstName: "Withdraw",
        lastName: "Adult",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
      },
      include: { clientProfile: true },
    });
    clientProfileId = user.clientProfile!.id;
    setMockUser({
      id: user.id,
      role: "CLIENT",
      email: user.email,
      isActive: true,
      clientProfile: { id: clientProfileId },
    });
  });

  function makeReq(method: "POST" | "DELETE", body?: unknown) {
    return new Request("http://localhost/api/health-intake", {
      method,
      headers: { "content-type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  it("hard-deletes all intake rows and writes a HealthIntakeWithdrawal audit row", async () => {
    await POST(makeReq("POST", validBody));
    await POST(makeReq("POST", validBody));

    const res = await DELETE(makeReq("DELETE"));
    expect(res.status).toBe(200);

    const remaining = await prisma.clientHealthIntake.count({ where: { clientProfileId } });
    expect(remaining).toBe(0);

    const audits = await prisma.healthIntakeWithdrawal.count({ where: { clientProfileId } });
    expect(audits).toBe(1);
  });

  it("is idempotent — DELETE with no intake rows still writes an audit row", async () => {
    const res = await DELETE(makeReq("DELETE"));
    expect(res.status).toBe(200);
    const audits = await prisma.healthIntakeWithdrawal.count({ where: { clientProfileId } });
    expect(audits).toBe(1);
  });
});

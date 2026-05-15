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

import { GET, POST } from "@/app/api/health-intake+api";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";

const validBody = {
  isPhysicallyActive: true,
  isFirstPilates: true,
  hasComplaints: false,
  hasInjuries: false,
  isPregnant: false,
  isPostpartum: false,
};

describe("/api/health-intake — record + read", () => {
  let userId: string;
  let clientProfileId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: {
        email: "intake@t.local",
        fullName: "Intake Adult",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
      },
      include: { clientProfile: true },
    });
    userId = user.id;
    clientProfileId = user.clientProfile!.id;
    setMockUser({
      id: user.id,
      role: "CLIENT",
      email: user.email,
      isActive: true,
      clientProfile: { id: clientProfileId },
    });
  });

  function makeReq(method: "GET" | "POST" | "DELETE", body?: unknown) {
    return new Request("http://localhost/api/health-intake", {
      method,
      headers: { "content-type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  it("POST creates intake row + parallel ConsentRecord(health_intake)", async () => {
    const res = await POST(makeReq("POST", validBody));
    expect(res.status).toBe(200);

    const intake = await prisma.clientHealthIntake.findFirstOrThrow({
      where: { clientProfileId },
    });
    expect(intake.isPhysicallyActive).toBe(true);

    const consent = await prisma.consentRecord.findFirstOrThrow({
      where: { userId, documentKey: "health_intake" },
    });
    expect(consent.accepted).toBe(true);
    expect(consent.version).toBe(1);
  });

  it("POST rejects with 400 when hasComplaints=true but complaintsDetails missing", async () => {
    const res = await POST(makeReq("POST", { ...validBody, hasComplaints: true }));
    expect(res.status).toBe(400);
  });

  it("POST rejects with 400 when hasInjuries=true but injuriesDetails missing", async () => {
    const res = await POST(makeReq("POST", { ...validBody, hasInjuries: true }));
    expect(res.status).toBe(400);
  });

  it("POST accepts when complaintsDetails populated for hasComplaints=true", async () => {
    const res = await POST(makeReq("POST", { ...validBody, hasComplaints: true, complaintsDetails: "bolovi u leđima" }));
    expect(res.status).toBe(200);
  });

  it("POST appends — newer row wins on GET", async () => {
    await POST(makeReq("POST", validBody));
    await POST(makeReq("POST", { ...validBody, isPregnant: true }));

    const rows = await prisma.clientHealthIntake.findMany({
      where: { clientProfileId },
      orderBy: { recordedAt: "asc" },
    });
    expect(rows).toHaveLength(2);

    const getRes = await GET(makeReq("GET"));
    const body = await getRes.json();
    expect(body.isPregnant).toBe(true);
  });

  it("GET returns 404 before any intake is recorded", async () => {
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(404);
  });
});

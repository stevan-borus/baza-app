import { describe, it, expect, beforeEach, vi } from "vitest";
import { setMockUser } from "./auth-mock";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET, POST } from "@/server/routes/health-intake";
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

describe("/api/health-intake — record + read", () => {
  let userId: string;
  let clientProfileId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: {
        email: "intake@t.local",
        firstName: "Intake",
        lastName: "Adult",
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
    expect(intake.activityLevel).toBe("moderate");
    expect(intake.pilatesExperience).toEqual(["none"]);

    const consent = await prisma.consentRecord.findFirstOrThrow({
      where: { userId, documentKey: "health_intake" },
    });
    expect(consent.accepted).toBe(true);
    expect(consent.version).toBe(1);
  });

  it("POST rejects with 400 when underMedicalTreatment=true but details missing", async () => {
    const res = await POST(
      makeReq("POST", { ...validBody, underMedicalTreatment: true }),
    );
    expect(res.status).toBe(400);
  });

  it("POST accepts when medicalTreatmentDetails populated", async () => {
    const res = await POST(
      makeReq("POST", {
        ...validBody,
        underMedicalTreatment: true,
        medicalTreatmentDetails: "blood pressure medication",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("POST appends — newer row wins on GET", async () => {
    await POST(makeReq("POST", validBody));
    await POST(
      makeReq("POST", { ...validBody, conditions: ["pregnancy_postpartum"] }),
    );

    const rows = await prisma.clientHealthIntake.findMany({
      where: { clientProfileId },
      orderBy: { recordedAt: "asc" },
    });
    expect(rows).toHaveLength(2);

    const getRes = await GET(makeReq("GET"));
    const body = await getRes.json();
    expect(body.conditions).toContain("pregnancy_postpartum");
  });

  it("GET returns 404 before any intake is recorded", async () => {
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(404);
  });
});

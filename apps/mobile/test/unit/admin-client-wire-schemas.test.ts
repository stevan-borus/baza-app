/**
 * Wire-contract tests for the two admin client endpoints that the clients
 * factory used to consume with bare `as` casts. Payload shapes mirror the
 * route handlers:
 *   - app/api/admin/clients/[id]/consent-records+api.ts → ok({ records, socialMedia })
 *     (note: NO `success` field — `ok()` doesn't add one)
 *   - app/api/admin/clients/[id]/health+api.ts → ok({ success, intake, withdrawnAt })
 *     (intake is the raw Prisma ClientHealthIntake row, or null)
 */
import { describe, expect, it } from "vitest";
import { adminClientConsentRecordsResponseSchema, adminClientHealthResponseSchema } from "@baza/types/clients";

describe("adminClientConsentRecordsResponseSchema", () => {
  it("parses the records + socialMedia payload", () => {
    const parsed = adminClientConsentRecordsResponseSchema.parse({
      records: [
        {
          id: "cr-1",
          documentKey: "tos",
          version: 2,
          acceptedAt: "2026-05-01T10:00:00.000Z",
          guardianVerifiedAt: null,
        },
        {
          id: "cr-2",
          documentKey: "waiver_minor",
          version: 1,
          acceptedAt: "2026-05-01T10:00:00.000Z",
          guardianVerifiedAt: "2026-05-02T08:00:00.000Z",
        },
      ],
      socialMedia: { accepted: true, acceptedAt: "2026-05-01T10:00:00.000Z" },
    });
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[1].guardianVerifiedAt).toBe("2026-05-02T08:00:00.000Z");
  });

  it("accepts a never-asked socialMedia as null", () => {
    const parsed = adminClientConsentRecordsResponseSchema.parse({
      records: [],
      socialMedia: null,
    });
    expect(parsed.socialMedia).toBeNull();
  });
});

describe("adminClientHealthResponseSchema", () => {
  const fullIntakeRow = {
    id: "hi-1",
    clientProfileId: "cp-1",
    conditions: ["back_pain"],
    conditionsOther: null,
    underMedicalTreatment: true,
    medicalTreatmentDetails: "physio",
    pilatesExperience: ["none"],
    pilatesExperienceDuration: null,
    activityLevel: "sedentary",
    exerciseFrequency: "2-3",
    goals: ["core_strength"],
    goalsOther: null,
    discomfortDuring: [],
    additionalNotes: null,
    recordedAt: "2026-05-01T10:00:00.000Z",
    recordedByUserId: null,
    guardianName: null,
    guardianRelation: null,
  };

  it("parses the full raw intake row (incl. guardian + audit fields the old cast omitted)", () => {
    const parsed = adminClientHealthResponseSchema.parse({
      success: true,
      intake: fullIntakeRow,
      withdrawnAt: null,
    });
    expect(parsed.intake?.guardianName).toBeNull();
    expect(parsed.intake?.conditions).toEqual(["back_pain"]);
  });

  it("parses the no-intake / withdrawn state", () => {
    const parsed = adminClientHealthResponseSchema.parse({
      success: true,
      intake: null,
      withdrawnAt: "2026-05-03T09:00:00.000Z",
    });
    expect(parsed.intake).toBeNull();
    expect(parsed.withdrawnAt).toBe("2026-05-03T09:00:00.000Z");
  });
});

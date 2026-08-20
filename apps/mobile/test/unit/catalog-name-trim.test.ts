/**
 * The staging "Energy " incident: a PackageType name saved with a trailing
 * space through the admin catalog form later broke a name-based lookup. The
 * fix trims name-ish identity fields at the zod (server-parse) layer, so no
 * client can persist a padded catalog name regardless of the UI.
 *
 * These parse-level tests pin that: a padded name normalizes to its trimmed
 * value on parse for every catalog create/update payload, plus the
 * guardianName person-name field on the health intake.
 */
import { describe, expect, it } from "vitest";
import {
  classTypeInputSchema,
  packageTypeInputSchema,
  studioRoomInputSchema,
  updateClassTypeInputSchema,
  updatePackageTypeInputSchema,
  updateStudioRoomInputSchema,
} from "@baza/types/catalog";
import { healthIntakeInputSchema } from "@baza/types/health-intake";

describe("catalog name fields trim on parse", () => {
  it("trims PackageType name on create (the 'Energy ' incident)", () => {
    const parsed = packageTypeInputSchema.parse({
      name: " Energy ",
      sessionCount: 10,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeIds: ["715846df-aa96-46c5-af12-9cff686465f9"],
    });
    expect(parsed.name).toBe("Energy");
  });

  it("trims PackageType name on update", () => {
    const parsed = updatePackageTypeInputSchema.parse({ name: "  Energy  " });
    expect(parsed.name).toBe("Energy");
  });

  it("trims ClassType name on create", () => {
    const parsed = classTypeInputSchema.parse({
      name: "  Reformer ",
      maxClients: 6,
      durationMins: 50,
      trialSessionValue: 1200,
    });
    expect(parsed.name).toBe("Reformer");
  });

  it("trims ClassType name on update", () => {
    const parsed = updateClassTypeInputSchema.parse({ name: "  Reformer  " });
    expect(parsed.name).toBe("Reformer");
  });

  it("trims StudioRoom name on create", () => {
    const parsed = studioRoomInputSchema.parse({
      name: " Sala 1 ",
      capacity: 8,
    });
    expect(parsed.name).toBe("Sala 1");
  });

  it("trims StudioRoom name on update", () => {
    const parsed = updateStudioRoomInputSchema.parse({ name: "  Sala 1  " });
    expect(parsed.name).toBe("Sala 1");
  });

  it("rejects a whitespace-only PackageType name (below min after trim)", () => {
    expect(() =>
      packageTypeInputSchema.parse({
        name: "   ",
        sessionCount: 10,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeIds: ["715846df-aa96-46c5-af12-9cff686465f9"],
      }),
    ).toThrow();
  });
});

describe("health intake guardianName trims on parse", () => {
  const base = {
    conditions: [],
    underMedicalTreatment: false,
    pilatesExperience: ["none"] as const,
    activityLevel: "sedentary",
    exerciseFrequency: "0-1",
    goals: [],
    discomfortDuring: [],
  };

  it("trims a padded guardianName", () => {
    const parsed = healthIntakeInputSchema.parse({
      ...base,
      guardianName: "  Ana Anić  ",
      guardianRelation: "roditelj",
    });
    expect(parsed.guardianName).toBe("Ana Anić");
  });
});

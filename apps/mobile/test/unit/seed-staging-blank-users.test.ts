import { describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma";
import { blankUserSpecs } from "@/scripts/seed-staging-blank-users-specs";

describe("blankUserSpecs", () => {
  it("returns three clients and one trainer", () => {
    const specs = blankUserSpecs();
    expect(specs).toHaveLength(4);
    expect(specs.filter((s) => s.role === UserRole.CLIENT)).toHaveLength(3);
    expect(specs.filter((s) => s.role === UserRole.TRAINER)).toHaveLength(1);
  });

  it("puts every account on the demo marker domain so the demo wipe removes them too", () => {
    for (const spec of blankUserSpecs()) {
      expect(spec.email.endsWith("@demo.baza.rs")).toBe(true);
    }
  });

  it("uses a unique email per account", () => {
    const emails = blankUserSpecs().map((s) => s.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("names the trainer account novi.trener@demo.baza.rs", () => {
    const trainer = blankUserSpecs().find((s) => s.role === UserRole.TRAINER);
    expect(trainer?.email).toBe("novi.trener@demo.baza.rs");
    expect(trainer?.firstName).toBe("Novi");
    expect(trainer?.lastName).toBe("Trener");
  });
});

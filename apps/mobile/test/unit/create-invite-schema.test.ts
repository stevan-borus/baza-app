import { describe, expect, it } from "vitest";
import { createInviteInputSchema } from "@baza/types/auth";

const base = {
  email: "person@test.local",
  firstName: "Ana",
  lastName: "Anić",
};

describe("createInviteInputSchema", () => {
  it("defaults role to CLIENT and requires dateOfBirth for clients", () => {
    const parsed = createInviteInputSchema.parse({
      ...base,
      dateOfBirth: "1990-05-14",
    });
    expect(parsed.role).toBe("CLIENT");
    expect(parsed.dateOfBirth).toBe("1990-05-14");
  });

  it("rejects a client invite without dateOfBirth", () => {
    const result = createInviteInputSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("accepts a TRAINER invite without dateOfBirth", () => {
    const parsed = createInviteInputSchema.parse({ ...base, role: "TRAINER" });
    expect(parsed.role).toBe("TRAINER");
    expect(parsed.dateOfBirth).toBeUndefined();
  });

  it("never accepts ADMIN — admin creation stays out-of-band", () => {
    const result = createInviteInputSchema.safeParse({ ...base, role: "ADMIN" });
    expect(result.success).toBe(false);
  });

  it("still accepts optional phone alongside a trainer role", () => {
    const parsed = createInviteInputSchema.parse({
      ...base,
      role: "TRAINER",
      phone: "+381601234567",
    });
    expect(parsed.phone).toBe("+381601234567");
  });
});

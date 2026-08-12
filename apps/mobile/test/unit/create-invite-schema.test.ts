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

  it("rejects an email that is not an email address", () => {
    const result = createInviteInputSchema.safeParse({
      ...base,
      email: "not-an-email",
      dateOfBirth: "1990-05-14",
    });
    expect(result.success).toBe(false);
  });

  it("accepts trainerPercent on a TRAINER invite", () => {
    const parsed = createInviteInputSchema.parse({
      ...base,
      role: "TRAINER",
      trainerPercent: 40,
    });
    expect(parsed.trainerPercent).toBe(40);
  });

  it("accepts a TRAINER invite without trainerPercent — the rate stays unset", () => {
    const parsed = createInviteInputSchema.parse({ ...base, role: "TRAINER" });
    expect(parsed.trainerPercent).toBeUndefined();
  });

  it.each([-1, 101, 40.5])(
    "rejects trainerPercent %s — outside the 0–100 whole-percent range",
    (percent) => {
      const result = createInviteInputSchema.safeParse({
        ...base,
        role: "TRAINER",
        trainerPercent: percent,
      });
      expect(result.success).toBe(false);
    },
  );

  it("rejects trainerPercent on a CLIENT invite — a client has no commission", () => {
    const result = createInviteInputSchema.safeParse({
      ...base,
      dateOfBirth: "1990-05-14",
      trainerPercent: 40,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["trainerPercent"]);
  });
});

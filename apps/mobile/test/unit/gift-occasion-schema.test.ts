/**
 * Wire contract for the optional gift occasion fields on POST
 * /api/packages/client-packages. A gifted package used to always send
 * birthday copy; `occasion` is what keeps the birthday wording pinned to an
 * assignment that really came from the birthday prompt, and `giftMessage`
 * is the admin's free-text note appended to the notification.
 *
 * Both are gift-only. The schema accepts them structurally; the route is what
 * rejects them without `isGift` (same shape as `sessionsGranted`), so this
 * file covers the parse and the route test covers the 400.
 */
import { describe, expect, it } from "vitest";
import { createClientPackageInputSchema } from "@baza/types/packages";

const BASE = {
  clientProfileId: "profile-1",
  packageTypeId: "pt-1",
  startsAt: "2026-09-17",
};

describe("createClientPackageInputSchema — gift occasion", () => {
  it("accepts a gift with an occasion and a message", () => {
    const parsed = createClientPackageInputSchema.parse({
      ...BASE,
      isGift: true,
      sessionsGranted: 2,
      occasion: "BIRTHDAY",
      giftMessage: "Čestitamo na diplomi!",
    });
    expect(parsed.occasion).toBe("BIRTHDAY");
    expect(parsed.giftMessage).toBe("Čestitamo na diplomi!");
  });

  it("trims the message and treats a blank one as absent", () => {
    const parsed = createClientPackageInputSchema.parse({
      ...BASE,
      isGift: true,
      giftMessage: "  Hvala na strpljenju.  ",
    });
    expect(parsed.giftMessage).toBe("Hvala na strpljenju.");

    const blank = createClientPackageInputSchema.parse({
      ...BASE,
      isGift: true,
      giftMessage: "   ",
    });
    expect(blank.giftMessage ?? null).toBeNull();
  });

  it("rejects a message longer than 200 characters", () => {
    const result = createClientPackageInputSchema.safeParse({
      ...BASE,
      isGift: true,
      giftMessage: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown occasion", () => {
    const result = createClientPackageInputSchema.safeParse({
      ...BASE,
      isGift: true,
      occasion: "GRADUATION",
    });
    expect(result.success).toBe(false);
  });

  it("leaves both absent when omitted", () => {
    const parsed = createClientPackageInputSchema.parse(BASE);
    expect(parsed.occasion ?? null).toBeNull();
    expect(parsed.giftMessage ?? null).toBeNull();
  });
});

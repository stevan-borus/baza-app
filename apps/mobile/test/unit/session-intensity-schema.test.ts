/**
 * Session intensity is an optional admin-set 1–3 marking. The rule lives at
 * the zod (server-parse) layer, not just the UI: any value outside {null, 1,
 * 2, 3} must be rejected on parse so no client can persist a rogue intensity.
 * Null clears the marking; omitting the field leaves it untouched.
 */
import { describe, expect, it } from "vitest";
import { updateSessionInputSchema } from "@baza/types/scheduling";

describe("updateSessionInputSchema intensity", () => {
  it.each([1, 2, 3])("accepts intensity %i", (intensity) => {
    const parsed = updateSessionInputSchema.parse({ intensity });
    expect(parsed.intensity).toBe(intensity);
  });

  it("accepts null (clears the marking)", () => {
    const parsed = updateSessionInputSchema.parse({ intensity: null });
    expect(parsed.intensity).toBeNull();
  });

  it("accepts an update that omits intensity entirely (leaves it untouched)", () => {
    const parsed = updateSessionInputSchema.parse({ capacity: 8 });
    expect(parsed.intensity).toBeUndefined();
  });

  it.each([0, 4, -1, 2.5])("rejects out-of-range intensity %s", (intensity) => {
    expect(updateSessionInputSchema.safeParse({ intensity }).success).toBe(
      false,
    );
  });

  it("rejects a non-numeric intensity", () => {
    expect(
      updateSessionInputSchema.safeParse({ intensity: "2" }).success,
    ).toBe(false);
  });
});

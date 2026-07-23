/**
 * Session "advanced" is an optional admin-set binary marking. The rule lives
 * at the zod (server-parse) layer: it's a plain boolean, and omitting the
 * field leaves the flag untouched.
 */
import { describe, expect, it } from "vitest";
import { updateSessionInputSchema } from "@baza/types/scheduling";

describe("updateSessionInputSchema isAdvanced", () => {
  it.each([true, false])("accepts isAdvanced=%s", (isAdvanced) => {
    const parsed = updateSessionInputSchema.parse({ isAdvanced });
    expect(parsed.isAdvanced).toBe(isAdvanced);
  });

  it("accepts an update that omits isAdvanced entirely (leaves it untouched)", () => {
    const parsed = updateSessionInputSchema.parse({ capacity: 8 });
    expect(parsed.isAdvanced).toBeUndefined();
  });

  it.each([1, 0, "true", null])(
    "rejects a non-boolean isAdvanced (%s)",
    (isAdvanced) => {
      expect(
        updateSessionInputSchema.safeParse({ isAdvanced }).success,
      ).toBe(false);
    },
  );
});

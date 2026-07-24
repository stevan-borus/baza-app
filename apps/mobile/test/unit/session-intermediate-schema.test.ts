/**
 * Session "intermediate" is an optional admin-set binary marking. The rule lives
 * at the zod (server-parse) layer: it's a plain boolean, and omitting the
 * field leaves the flag untouched.
 */
import { describe, expect, it } from "vitest";
import { updateSessionInputSchema } from "@baza/types/scheduling";

describe("updateSessionInputSchema isIntermediate", () => {
  it.each([true, false])("accepts isIntermediate=%s", (isIntermediate) => {
    const parsed = updateSessionInputSchema.parse({ isIntermediate });
    expect(parsed.isIntermediate).toBe(isIntermediate);
  });

  it("accepts an update that omits isIntermediate entirely (leaves it untouched)", () => {
    const parsed = updateSessionInputSchema.parse({ capacity: 8 });
    expect(parsed.isIntermediate).toBeUndefined();
  });

  it.each([1, 0, "true", null])(
    "rejects a non-boolean isIntermediate (%s)",
    (isIntermediate) => {
      expect(
        updateSessionInputSchema.safeParse({ isIntermediate }).success,
      ).toBe(false);
    },
  );
});

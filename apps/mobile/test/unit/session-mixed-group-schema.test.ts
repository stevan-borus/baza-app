/**
 * Session "mixed group" is an optional admin-set binary marking telling clients
 * the occurrence trains men and women together. The rule lives at the zod
 * (server-parse) layer: it's a plain boolean, and omitting the field leaves the
 * flag untouched — same contract as `isIntermediate`.
 */
import { describe, expect, it } from "vitest";
import { updateSessionInputSchema } from "@baza/types/scheduling";

describe("updateSessionInputSchema isMixedGroup", () => {
  it.each([true, false])("accepts isMixedGroup=%s", (isMixedGroup) => {
    const parsed = updateSessionInputSchema.parse({ isMixedGroup });
    expect(parsed.isMixedGroup).toBe(isMixedGroup);
  });

  it("accepts an update that omits isMixedGroup entirely (leaves it untouched)", () => {
    const parsed = updateSessionInputSchema.parse({ capacity: 8 });
    expect(parsed.isMixedGroup).toBeUndefined();
  });

  it.each([1, 0, "true", null])(
    "rejects a non-boolean isMixedGroup (%s)",
    (isMixedGroup) => {
      expect(updateSessionInputSchema.safeParse({ isMixedGroup }).success).toBe(
        false,
      );
    },
  );

  it("carries both marks independently on one update", () => {
    // The two marks are orthogonal: a session can be intermediate, mixed,
    // both, or neither. Nothing couples them.
    const parsed = updateSessionInputSchema.parse({
      isIntermediate: true,
      isMixedGroup: false,
    });
    expect(parsed.isIntermediate).toBe(true);
    expect(parsed.isMixedGroup).toBe(false);
  });
});

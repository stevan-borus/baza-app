/**
 * Tests for the anchor-time `now()` helper.
 *
 * The helper resolves the "current time" the entire stack uses. When
 * `TEST_ANCHOR_TIME` is set to a parseable instant, the helper returns that
 * exact instant; otherwise it falls back to wall-clock `new Date()`.
 *
 * See CONTEXT.md → "Anchor time" for the rationale.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("now() / nowMs() anchor-time helper", () => {
  const original = process.env.TEST_ANCHOR_TIME;

  beforeEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.TEST_ANCHOR_TIME;
    else process.env.TEST_ANCHOR_TIME = original;
  });

  it("returns the current wall-clock instant when TEST_ANCHOR_TIME is unset", async () => {
    delete process.env.TEST_ANCHOR_TIME;
    const { now, nowMs } = await import("@/lib/now");
    const wall = Date.now();
    const result = now();
    expect(Math.abs(result.getTime() - wall)).toBeLessThan(1000);
    expect(Math.abs(nowMs() - wall)).toBeLessThan(1000);
  });

  it("returns the pinned anchor when TEST_ANCHOR_TIME is set to an ISO instant", async () => {
    process.env.TEST_ANCHOR_TIME = "2026-05-09T10:00:00Z";
    const { now, nowMs } = await import("@/lib/now");
    expect(now().toISOString()).toBe("2026-05-09T10:00:00.000Z");
    expect(nowMs()).toBe(Date.parse("2026-05-09T10:00:00Z"));
  });

  it("falls back to wall-clock when TEST_ANCHOR_TIME is unparseable", async () => {
    process.env.TEST_ANCHOR_TIME = "not-a-date";
    const { now } = await import("@/lib/now");
    const wall = Date.now();
    expect(Math.abs(now().getTime() - wall)).toBeLessThan(1000);
  });

  it("returns a fresh Date each call (not a shared mutable reference)", async () => {
    process.env.TEST_ANCHOR_TIME = "2026-05-09T10:00:00Z";
    const { now } = await import("@/lib/now");
    const a = now();
    const b = now();
    expect(a).not.toBe(b);
    expect(a.getTime()).toBe(b.getTime());
  });
});

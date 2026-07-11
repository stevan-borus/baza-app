/**
 * Unit tests for useDebouncedValue — the search-box debounce that stops every
 * keystroke from firing its own API request (see the per-letter GET pairs the
 * Naplata/Klijenti search boxes produced before this hook existed).
 *
 * Driven with react-test-renderer + fake timers: mount the hook, push a
 * sequence of values, advance the clock, and read what the hook currently
 * returns. No RTL (not installed in this repo).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useDebouncedValue } from "@/lib/use-debounced-value";

// Renders the hook and exposes a setter to push new inputs plus a getter for
// the hook's current output. Kept local — the repo has no shared renderHook.
function mountHook(initial: string, delay?: number) {
  let output!: string;
  let setInput!: (v: string) => void;

  function Probe() {
    const [value, setValue] = React.useState(initial);
    setInput = setValue;
    output = useDebouncedValue(value, delay);
    return null;
  }

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  return {
    get: () => output,
    set: (v: string) => act(() => setInput(v)),
    unmount: () => act(() => renderer.unmount()),
  };
}

// Advance fake timers inside act() so the debounce's setState re-render is
// flushed. Block body keeps the act callback returning void (advanceTimersByTime
// returns the timer instance, which act's overloads reject).
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useDebouncedValue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    vi.useFakeTimers();
    const h = mountHook("start");
    expect(h.get()).toBe("start");
    h.unmount();
  });

  it("does not update until the delay elapses", () => {
    vi.useFakeTimers();
    const h = mountHook("", 400);
    h.set("a");
    // Before the delay: still the old value.
    advance(399);
    expect(h.get()).toBe("");
    // After the delay: updated.
    advance(1);
    expect(h.get()).toBe("a");
    h.unmount();
  });

  it("collapses a rapid burst of changes into the final value only", () => {
    vi.useFakeTimers();
    const h = mountHook("", 400);
    // Type f-u-u-t faster than the delay — each keystroke resets the timer.
    h.set("f");
    advance(100);
    h.set("fu");
    advance(100);
    h.set("fuu");
    advance(100);
    h.set("fuut");
    // Only 100ms since the last keystroke — nothing has settled yet.
    expect(h.get()).toBe("");
    // Let the timer finish: it jumps straight to the last value, never the
    // intermediate ones.
    advance(400);
    expect(h.get()).toBe("fuut");
    h.unmount();
  });

  it("defaults to a 400ms delay when none is given", () => {
    vi.useFakeTimers();
    const h = mountHook("");
    h.set("x");
    advance(399);
    expect(h.get()).toBe("");
    advance(1);
    expect(h.get()).toBe("x");
    h.unmount();
  });

  it("does not emit a stale value after unmount", () => {
    vi.useFakeTimers();
    const h = mountHook("", 400);
    h.set("late");
    h.unmount();
    // Advancing after unmount must not throw (timer was cleaned up).
    expect(() => advance(400)).not.toThrow();
  });
});

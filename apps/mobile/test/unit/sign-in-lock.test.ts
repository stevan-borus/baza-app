import { describe, expect, it } from "vitest";
import {
  SIGN_IN_LOCK_DURATION_MS,
  SIGN_IN_LOCK_MAX_ATTEMPTS,
  SIGN_IN_LOCK_WINDOW_MS,
  nextFailureState,
  signInLockResetData,
} from "@/lib/sign-in-lock-rules";

const AT = new Date("2026-09-08T10:00:00.000Z");

describe("sign-in lock decision", () => {
  it("counts the first failure as one attempt and locks nothing", () => {
    const next = nextFailureState(
      { failedSignInCount: 0, lastFailedSignInAt: null },
      AT,
    );
    expect(next.failedSignInCount).toBe(1);
    expect(next.lockedUntil).toBeNull();
    expect(next.lastFailedSignInAt).toEqual(AT);
  });

  it("increments the count for a failure inside the window", () => {
    const next = nextFailureState(
      {
        failedSignInCount: 2,
        lastFailedSignInAt: new Date(AT.getTime() - SIGN_IN_LOCK_WINDOW_MS + 1000),
      },
      AT,
    );
    expect(next.failedSignInCount).toBe(3);
    expect(next.lockedUntil).toBeNull();
  });

  it("restarts the count when the previous failure is older than the window", () => {
    const next = nextFailureState(
      {
        failedSignInCount: 4,
        lastFailedSignInAt: new Date(AT.getTime() - SIGN_IN_LOCK_WINDOW_MS - 1000),
      },
      AT,
    );
    expect(next.failedSignInCount).toBe(1);
    expect(next.lockedUntil).toBeNull();
  });

  it("locks for the lock duration on the fifth failure inside the window", () => {
    const next = nextFailureState(
      {
        failedSignInCount: SIGN_IN_LOCK_MAX_ATTEMPTS - 1,
        lastFailedSignInAt: new Date(AT.getTime() - 60_000),
      },
      AT,
    );
    expect(next.lockedUntil).toEqual(
      new Date(AT.getTime() + SIGN_IN_LOCK_DURATION_MS),
    );
    expect(SIGN_IN_LOCK_DURATION_MS).toBe(15 * 60_000);
  });

  it("resets the count to zero when it locks so expiry grants a fresh five", () => {
    const next = nextFailureState(
      {
        failedSignInCount: SIGN_IN_LOCK_MAX_ATTEMPTS - 1,
        lastFailedSignInAt: new Date(AT.getTime() - 60_000),
      },
      AT,
    );
    expect(next.failedSignInCount).toBe(0);
  });

  it("clears count, last failure and lock on a successful sign-in", () => {
    expect(signInLockResetData()).toEqual({
      failedSignInCount: 0,
      lastFailedSignInAt: null,
      lockedUntil: null,
    });
  });
});

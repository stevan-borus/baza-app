/**
 * The sign-in lock rule (CONTEXT.md → People) as pure arithmetic over the
 * stored counters and the current instant. Kept free of Prisma so the window
 * and threshold logic is unit-testable without a database; the reads and
 * writes around it live in `lib/server/sign-in-lock.ts`.
 */
export const SIGN_IN_LOCK_MAX_ATTEMPTS = 5;
export const SIGN_IN_LOCK_WINDOW_MS = 15 * 60_000;
export const SIGN_IN_LOCK_DURATION_MS = 15 * 60_000;

export type SignInFailureCounters = {
  failedSignInCount: number;
  lastFailedSignInAt: Date | null;
};

export type SignInLockState = SignInFailureCounters & {
  lockedUntil: Date | null;
};

export function nextFailureState(
  current: SignInFailureCounters,
  at: Date,
): SignInLockState {
  const withinWindow =
    current.lastFailedSignInAt !== null &&
    at.getTime() - current.lastFailedSignInAt.getTime() <=
      SIGN_IN_LOCK_WINDOW_MS;

  const count = withinWindow ? current.failedSignInCount + 1 : 1;

  if (count >= SIGN_IN_LOCK_MAX_ATTEMPTS) {
    // Zero the count alongside the lock so expiry hands back a fresh five
    // attempts rather than locking again on the very next wrong password.
    return {
      failedSignInCount: 0,
      lastFailedSignInAt: at,
      lockedUntil: new Date(at.getTime() + SIGN_IN_LOCK_DURATION_MS),
    };
  }

  return { failedSignInCount: count, lastFailedSignInAt: at, lockedUntil: null };
}

/** The cleared state, shared by success, Admin unlock and password reset. */
export function signInLockResetData(): SignInLockState {
  return { failedSignInCount: 0, lastFailedSignInAt: null, lockedUntil: null };
}

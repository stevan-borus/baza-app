import { now } from "@/lib/now";
import {
  nextFailureState,
  signInLockResetData,
} from "@/lib/sign-in-lock-rules";
import { prisma } from "@/lib/server/prisma";

/**
 * Sign-in lock (CONTEXT.md → People): after too many wrong passwords in a
 * short span a User is rejected at sign-in even with the correct password,
 * until the lock expires, they complete a password reset, or an Admin unlocks
 * them. Independent of Deactivated — a locked User is still a member.
 *
 * Only existing emails are tracked. Counting attempts against unknown emails
 * would let a caller probe which addresses the studio holds.
 */
export {
  SIGN_IN_LOCK_DURATION_MS,
  SIGN_IN_LOCK_MAX_ATTEMPTS,
  SIGN_IN_LOCK_WINDOW_MS,
  signInLockResetData,
} from "@/lib/sign-in-lock-rules";

/** Mirrors better-auth's own lookup, which lowercases the email first. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The User's lock if it is still in the future, else null. */
export async function getActiveLock(
  email: string,
): Promise<{ userId: string; lockedUntil: Date } | null> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, lockedUntil: true },
  });
  if (!user?.lockedUntil) return null;
  if (user.lockedUntil <= now()) return null;
  return { userId: user.id, lockedUntil: user.lockedUntil };
}

export async function recordFailedSignIn(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, failedSignInCount: true, lastFailedSignInAt: true },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: nextFailureState(
      {
        failedSignInCount: user.failedSignInCount,
        lastFailedSignInAt: user.lastFailedSignInAt,
      },
      now(),
    ),
  });
}

export async function recordSuccessfulSignIn(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: signInLockResetData(),
  });
}

export async function clearSignInLock(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: signInLockResetData(),
  });
}

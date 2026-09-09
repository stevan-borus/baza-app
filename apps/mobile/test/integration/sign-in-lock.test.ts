import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./setup-db";
import { auth } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/password";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";
import {
  SIGN_IN_LOCK_MAX_ATTEMPTS,
  SIGN_IN_LOCK_WINDOW_MS,
} from "@/lib/sign-in-lock-rules";

const EMAIL = "locked@test.local";
const PASSWORD = "TacnaSifra123!";
const WRONG = "PogresnaSifra123!";

async function createSignInUser(email = EMAIL) {
  const password = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      firstName: "Ana",
      lastName: "Petrović",
      role: "ADMIN",
      passwordHash: password,
      emailVerified: true,
    },
  });
  await prisma.authAccount.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.email,
      password,
    },
  });
  return user;
}

function signIn(email: string, password: string) {
  return auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    asResponse: true,
  });
}

/**
 * The locked path has to go through `auth.handler` — the same entry point
 * `app/api/auth/[...all]/+api.ts` uses. A `hooks.before` throw propagates out
 * of a direct `auth.api.*` call uncaught (better-auth only converts errors
 * raised inside the endpoint itself), so only the HTTP handler turns our
 * APIError into the 423 the client actually receives.
 */
function signInOverHttp(email: string, password: string) {
  return auth.handler(
    new Request("http://test.local/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function readCounters(email: string) {
  return prisma.user.findUniqueOrThrow({
    where: { email },
    select: { failedSignInCount: true, lockedUntil: true, lastFailedSignInAt: true },
  });
}

describe("sign-in lock", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("resets the failure count when a correct password lands before the limit", async () => {
    await createSignInUser();

    for (let attempt = 0; attempt < SIGN_IN_LOCK_MAX_ATTEMPTS - 1; attempt++) {
      const response = await signIn(EMAIL, WRONG);
      expect(response.status).toBe(401);
    }
    expect((await readCounters(EMAIL)).failedSignInCount).toBe(
      SIGN_IN_LOCK_MAX_ATTEMPTS - 1,
    );

    const success = await signIn(EMAIL, PASSWORD);
    expect(success.status).toBe(200);

    const after = await readCounters(EMAIL);
    expect(after.failedSignInCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.lastFailedSignInAt).toBeNull();
  });

  it("rejects the correct password once five wrong ones have locked the account", async () => {
    await createSignInUser();

    for (let attempt = 0; attempt < SIGN_IN_LOCK_MAX_ATTEMPTS; attempt++) {
      await signIn(EMAIL, WRONG);
    }
    expect((await readCounters(EMAIL)).lockedUntil).not.toBeNull();

    const locked = await signInOverHttp(EMAIL, PASSWORD);
    expect(locked.status).toBe(423);

    const body = (await locked.json()) as {
      code?: string;
      lockedUntil?: string;
    };
    expect(body.code).toBe("ACCOUNT_LOCKED");
    expect(typeof body.lockedUntil).toBe("string");
    expect(new Date(body.lockedUntil as string).getTime()).toBeGreaterThan(
      nowMs(),
    );
  });

  it("never locks anything for a wrong password on an unknown email", async () => {
    for (let attempt = 0; attempt < SIGN_IN_LOCK_MAX_ATTEMPTS + 1; attempt++) {
      const response = await signIn("nobody@test.local", WRONG);
      expect(response.status).toBe(401);
    }
    expect(await prisma.user.count({ where: { lockedUntil: { not: null } } })).toBe(0);
  });

  it("stops blocking once the lock has expired", async () => {
    const user = await createSignInUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(nowMs() - 60_000), failedSignInCount: 0 },
    });

    const response = await signIn(EMAIL, PASSWORD);
    expect(response.status).toBe(200);
  });

  it("restarts the count when the previous failure is older than the window", async () => {
    const user = await createSignInUser();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedSignInCount: SIGN_IN_LOCK_MAX_ATTEMPTS - 1,
        lastFailedSignInAt: new Date(nowMs() - SIGN_IN_LOCK_WINDOW_MS - 60_000),
      },
    });

    const response = await signIn(EMAIL, WRONG);
    expect(response.status).toBe(401);

    const after = await readCounters(EMAIL);
    expect(after.failedSignInCount).toBe(1);
    expect(after.lockedUntil).toBeNull();
  });
});

describe("sign-in lock — email case", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("locks the account when the wrong passwords arrive with a mixed-case email", async () => {
    await createSignInUser();
    const mixedCase = "Locked@Test.Local";

    for (let attempt = 0; attempt < SIGN_IN_LOCK_MAX_ATTEMPTS; attempt++) {
      await signIn(mixedCase, WRONG);
    }

    // Hitting the threshold zeroes the count alongside setting the lock, so
    // the lock itself is the signal that the mixed-case failures were counted.
    const after = await readCounters(EMAIL);
    expect(after.lockedUntil).not.toBeNull();
    expect((after.lockedUntil as Date).getTime()).toBeGreaterThan(nowMs());
  });

  it("enforces an active lock against a mixed-case email", async () => {
    const user = await createSignInUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(nowMs() + 60_000) },
    });

    const locked = await signInOverHttp("LOCKED@TEST.LOCAL", PASSWORD);
    expect(locked.status).toBe(423);

    const body = (await locked.json()) as { code?: string };
    expect(body.code).toBe("ACCOUNT_LOCKED");
  });
});

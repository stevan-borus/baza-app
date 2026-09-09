/**
 * The sign-in error classifier.
 *
 * better-auth's client hands back `response.error` as the parsed JSON body
 * with `status`/`statusText` spread on top, so a locked account arrives as
 * `{ code: "ACCOUNT_LOCKED", lockedUntil, status: 423 }`. The screen has to
 * tell that apart from every other failure (wrong password, network, 500)
 * because only the locked case gets a countdown instead of the generic copy.
 *
 * The minute arithmetic rounds UP and floors at 1: "try again in 0 min" reads
 * as "try again now", which is exactly the thing that is not true, and an
 * anchor that has already passed the lock still has to say something.
 */
import { describe, expect, it } from "vitest";
import {
  SignInError,
  lockMinutesRemaining,
  toSignInError,
} from "@/lib/sign-in-error";

const MINUTE = 60_000;
const ANCHOR = Date.parse("2026-09-08T10:00:00.000Z");

describe("toSignInError", () => {
  it("recognises the locked body better-auth spreads onto error", () => {
    const error = toSignInError({
      code: "ACCOUNT_LOCKED",
      message: "Account temporarily locked",
      lockedUntil: "2026-09-08T10:15:00.000Z",
      status: 423,
      statusText: "Locked",
    });

    expect(error).toBeInstanceOf(SignInError);
    expect(error.code).toBe("ACCOUNT_LOCKED");
    expect(error.lockedUntil).toBe("2026-09-08T10:15:00.000Z");
  });

  it("maps a wrong-password body to the generic kind", () => {
    const error = toSignInError({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
      status: 401,
      statusText: "Unauthorized",
    });

    expect(error.code).toBeNull();
    expect(error.lockedUntil).toBeNull();
  });

  it("maps a bodyless failure to the generic kind", () => {
    const error = toSignInError({ status: 500, statusText: "Server Error" });
    expect(error.code).toBeNull();
  });

  it("maps a null/undefined error to the generic kind", () => {
    expect(toSignInError(undefined).code).toBeNull();
    expect(toSignInError(null).code).toBeNull();
  });

  it("does not call itself locked when lockedUntil is missing", () => {
    // A code with no instant behind it cannot render a countdown, so it has
    // to fall back rather than print "za NaN min".
    const error = toSignInError({ code: "ACCOUNT_LOCKED", status: 423 });
    expect(error.code).toBeNull();
  });

  it("does not call itself locked when lockedUntil is unparseable", () => {
    const error = toSignInError({
      code: "ACCOUNT_LOCKED",
      lockedUntil: "not-a-date",
      status: 423,
    });
    expect(error.code).toBeNull();
  });

  it("recognises a lockedUntil that arrived as a Date, not a string", () => {
    // better-auth's client parses the response with a reviver that turns any
    // ISO-8601 string into a Date (`betterJSONParse`, parseDates: true). The
    // wire body really does carry a string — verified against the running
    // server — but by the time `response.error` reaches us the field is a
    // Date object, so a string-only check silently falls through to the
    // generic copy on a real lock.
    const error = toSignInError({
      code: "ACCOUNT_LOCKED",
      message: "Account temporarily locked",
      lockedUntil: new Date("2026-09-08T10:15:00.000Z"),
      status: 423,
    });

    expect(error.code).toBe("ACCOUNT_LOCKED");
    expect(error.lockedUntil).toBe("2026-09-08T10:15:00.000Z");
  });

  it("ignores an Invalid Date the reviver could hand back", () => {
    const error = toSignInError({
      code: "ACCOUNT_LOCKED",
      lockedUntil: new Date("nonsense"),
      status: 423,
    });
    expect(error.code).toBeNull();
  });

  it("keeps the server message as the Error message", () => {
    const error = toSignInError({
      code: "ACCOUNT_LOCKED",
      message: "Account temporarily locked",
      lockedUntil: "2026-09-08T10:15:00.000Z",
      status: 423,
    });
    expect(error.message).toBe("Account temporarily locked");
  });
});

describe("lockMinutesRemaining", () => {
  it("rounds a whole remainder to that many minutes", () => {
    expect(
      lockMinutesRemaining("2026-09-08T10:15:00.000Z", ANCHOR),
    ).toBe(15);
  });

  it("rounds a partial minute UP", () => {
    // 2 minutes 1 second left is not "2 min" — the lock outlives that.
    expect(
      lockMinutesRemaining(new Date(ANCHOR + 2 * MINUTE + 1000).toISOString(), ANCHOR),
    ).toBe(3);
  });

  it("never drops below 1 for a lock a few seconds out", () => {
    expect(
      lockMinutesRemaining(new Date(ANCHOR + 1000).toISOString(), ANCHOR),
    ).toBe(1);
  });

  it("returns 1 for a lockedUntil already in the past", () => {
    expect(
      lockMinutesRemaining(new Date(ANCHOR - 5 * MINUTE).toISOString(), ANCHOR),
    ).toBe(1);
  });

  it("returns 1 for an unparseable instant", () => {
    expect(lockMinutesRemaining("not-a-date", ANCHOR)).toBe(1);
  });

  it("counts minutes off a Date-valued lockedUntil too", () => {
    expect(
      lockMinutesRemaining(new Date(ANCHOR + 15 * MINUTE), ANCHOR),
    ).toBe(15);
  });

  it("returns 1 for null", () => {
    expect(lockMinutesRemaining(null, ANCHOR)).toBe(1);
  });
});

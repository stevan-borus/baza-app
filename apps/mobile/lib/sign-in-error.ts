/**
 * Classifying what came back from a failed sign-in.
 *
 * better-auth's client never throws — `signIn.email` resolves to
 * `{ data, error }`, and `error` is the parsed JSON body with `status` and
 * `statusText` spread on top of it (see @better-fetch/fetch). So the 423 the
 * server answers for a locked account arrives as
 * `{ code: "ACCOUNT_LOCKED", message, lockedUntil, status: 423 }` — our extra
 * `lockedUntil` field rides along with the rest of the body.
 *
 * The screen needs one bit out of that: is this the sign-in lock (countdown
 * copy) or anything else (the generic failure). A body that claims the code
 * but carries no usable instant is treated as generic — a countdown with no
 * number to count is worse than the plain message.
 *
 * `lockedUntil` is accepted as a Date as well as a string. The observed shape
 * is the string the server sent, but better-auth parses responses with a
 * reviver that turns ISO-8601 strings into Dates (`betterJSONParse`,
 * parseDates: true) — whether it fires depends on the client's fetch plugins,
 * and a string-only check would silently fall back to the generic copy on a
 * real lock if it ever does.
 */

export const ACCOUNT_LOCKED = "ACCOUNT_LOCKED";

export class SignInError extends Error {
  readonly code: typeof ACCOUNT_LOCKED | null;
  readonly lockedUntil: string | null;

  constructor(
    message: string,
    code: typeof ACCOUNT_LOCKED | null,
    lockedUntil: string | null,
  ) {
    super(message);
    this.name = "SignInError";
    this.code = code;
    this.lockedUntil = lockedUntil;
  }
}

/** Milliseconds for an instant the client may hand us as a string or a Date. */
function instantMs(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Turns better-auth's `response.error` into the error the screen renders. */
export function toSignInError(raw: unknown): SignInError {
  const body = (raw ?? {}) as Record<string, unknown>;
  const message =
    typeof body.message === "string" && body.message
      ? body.message
      : "Sign-in failed";

  const lockedMs = instantMs(body.lockedUntil);
  if (body.code === ACCOUNT_LOCKED && lockedMs !== null) {
    // Normalised to an ISO string so everything downstream sees one type,
    // whichever shape the client handed us.
    return new SignInError(
      message,
      ACCOUNT_LOCKED,
      new Date(lockedMs).toISOString(),
    );
  }
  return new SignInError(message, null, null);
}

/**
 * Whole minutes until the lock lifts, as the banner says them.
 *
 * Rounds up — 2m01s left is "3 min", because "2 min" would invite a retry the
 * server still rejects — and floors at 1, so a lock seconds away (or one whose
 * instant has already passed by the time the banner renders) never reads
 * "0 min", which a user parses as "now".
 */
export function lockMinutesRemaining(
  lockedUntil: string | Date | null,
  currentMs: number,
): number {
  const lockedMs = instantMs(lockedUntil);
  if (lockedMs === null) return 1;
  return Math.max(1, Math.ceil((lockedMs - currentMs) / 60_000));
}

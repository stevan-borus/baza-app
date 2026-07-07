import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { formatMutationError } from "@/lib/admin/format-mutation-error";
import { ApiError } from "@/lib/api-error";

// Minimal i18n stub: echoes the key so assertions can check WHICH message was
// chosen without loading the locale bundles. Interpolation values are ignored —
// these tests only care that a friendly key (never raw JSON) is returned.
const t = ((key: string) => key) as unknown as TFunction;

const FALLBACK = "fallback.message";

describe("formatMutationError", () => {
  it("returns the fallback for a plain Error with no useful message", () => {
    expect(formatMutationError(new Error(""), t, "sr", FALLBACK)).toBe(FALLBACK);
  });

  // A non-ApiError's own `.message` is raw English (e.g. a fetch failure). It must
  // NOT reach the user under a Serbian UI — the caller's localized fallback wins.
  it("returns the fallback for a non-ApiError Error, never its raw message", () => {
    const result = formatMutationError(
      new Error("Network request failed"),
      t,
      "sr",
      FALLBACK,
    );
    expect(result).toBe(FALLBACK);
    expect(result).not.toContain("Network request failed");
  });

  // The server's `error` string is hardcoded English ("Invalid payload",
  // "Invalid startsAt date", …). Showing it verbatim is the i18n leak — an
  // unrecognized 4xx falls back to the localized message instead.
  it("returns the fallback for a generic 4xx ApiError, not the server's English", () => {
    const err = new ApiError(
      400,
      { success: false, error: "Invalid payload" },
      FALLBACK,
    );
    const result = formatMutationError(err, t, "sr", FALLBACK);
    expect(result).toBe(FALLBACK);
    expect(result).not.toContain("Invalid payload");
  });

  it("returns the fallback for an 'Invalid startsAt date' 4xx, not the server's English", () => {
    const err = new ApiError(
      400,
      { success: false, error: "Invalid startsAt date" },
      FALLBACK,
    );
    expect(formatMutationError(err, t, "sr", FALLBACK)).toBe(FALLBACK);
  });

  // The reported bug: adding a repeating session returned a 502. `apiRequest`
  // can't parse the gateway's non-JSON body, so it throws an ApiError with a
  // null body and the English fallback message baked into `.message`
  // ("Unable to create recurring sessions (502)"). That English string must
  // NEVER surface under a Serbian UI — the localized fallback wins.
  it("returns the fallback for a 502 with an unparseable body (the repeating-session bug)", () => {
    const err = new ApiError(
      502,
      null,
      "Unable to create recurring sessions (502)",
    );
    const result = formatMutationError(err, t, "sr", FALLBACK);
    expect(result).toBe(FALLBACK);
    expect(result).not.toContain("502");
    expect(result).not.toContain("Unable to create");
  });

  // The bug from the screenshot: a client-side response-schema `.parse()` throws
  // a raw ZodError whose `.message` is a stringified issues array. That JSON must
  // NEVER reach the user — fall back to the friendly message instead.
  it("swallows a raw ZodError (stringified issues array) into the fallback", () => {
    const zodLikeMessage = JSON.stringify([
      {
        expected: "string",
        code: "invalid_type",
        path: ["session", "trainerUserId"],
        message: "Invalid input: expected string, received undefined",
      },
    ]);
    const zodError = new Error(zodLikeMessage);
    zodError.name = "ZodError";

    const result = formatMutationError(zodError, t, "sr", FALLBACK);
    expect(result).toBe(FALLBACK);
    expect(result).not.toContain("invalid_type");
    expect(result).not.toContain("trainerUserId");
  });

  // Defense in depth: even if some other error type carries a stringified
  // JSON-array message (e.g. an ApiError whose `error` field is a serialized
  // issues list), don't leak the raw bracketed JSON.
  it("swallows any message that is a stringified JSON array of issues", () => {
    const err = new Error(
      '[{ "code": "invalid_type", "message": "expected string" }]',
    );
    const result = formatMutationError(err, t, "sr", FALLBACK);
    expect(result).toBe(FALLBACK);
  });

  // The good path must survive the fallback tightening: a recognized recurring
  // schedule-conflict body is already built from `t(...)` keys, so it still
  // produces the detailed localized message (not the generic fallback).
  it("still returns the detailed localized message for a recurring schedule-conflict body", () => {
    const err = new ApiError(
      409,
      {
        success: false,
        error: "Schedule conflict",
        conflicts: [
          {
            occurrenceStartsAt: "2026-07-13T09:00:00.000Z",
            occurrenceEndsAt: "2026-07-13T10:00:00.000Z",
            kind: "trainer",
            existingStartsAt: "2026-07-13T09:00:00.000Z",
            existingEndsAt: "2026-07-13T10:00:00.000Z",
            existingRoomName: null,
            existingTrainerName: "Ana",
            existingClassTypeName: "Reformer",
          },
        ],
        conflictCount: 1,
        totalOccurrences: 4,
      },
      FALLBACK,
    );
    const result = formatMutationError(err, t, "sr", FALLBACK);
    expect(result).not.toBe(FALLBACK);
    // Built from the localized conflict keys (the stub echoes the key).
    expect(result).toContain("admin.errors.scheduleConflict");
  });
});

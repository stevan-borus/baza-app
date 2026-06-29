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

  it("returns a non-ApiError Error's own message when it is human-readable", () => {
    expect(
      formatMutationError(new Error("Network request failed"), t, "sr", FALLBACK),
    ).toBe("Network request failed");
  });

  it("returns the server's `error` string for a generic 4xx ApiError", () => {
    const err = new ApiError(
      400,
      { success: false, error: "Invalid payload" },
      FALLBACK,
    );
    expect(formatMutationError(err, t, "sr", FALLBACK)).toBe("Invalid payload");
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
});

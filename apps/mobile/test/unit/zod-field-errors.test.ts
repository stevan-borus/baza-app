import { describe, expect, it } from "vitest";
import { fieldErrorsFromApiError } from "@/lib/zod-field-errors";

// Re-create the ApiError shape locally — importing `@/lib/api` pulls in
// react-native, which vitest's node env can't transform. The helper consumes
// the structural shape, not the class identity, so this is sufficient.
class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, fallbackMessage: string) {
    const serverMessage =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : null;
    super(serverMessage ?? fallbackMessage);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

describe("fieldErrorsFromApiError", () => {
  it("returns an empty map when the error is not an ApiError", () => {
    expect(fieldErrorsFromApiError(new Error("boom"))).toEqual({});
    expect(fieldErrorsFromApiError(null)).toEqual({});
    expect(fieldErrorsFromApiError(undefined)).toEqual({});
  });

  it("extracts ZodError path → message pairs from ApiError details", () => {
    const zodErrorDetails = {
      name: "ZodError",
      issues: [
        {
          code: "custom",
          path: ["sessionCount"],
          message: "Birthday gift PackageTypes must have sessionCount = 1",
        },
        {
          code: "too_small",
          path: ["validityDays"],
          message: "Validity must be at least 1 day",
        },
      ],
    };
    const apiError = new ApiError(
      400,
      { success: false, error: "Invalid payload", details: zodErrorDetails },
      "Unable to update",
    );
    expect(fieldErrorsFromApiError(apiError)).toEqual({
      sessionCount: "Birthday gift PackageTypes must have sessionCount = 1",
      validityDays: "Validity must be at least 1 day",
    });
  });

  it("returns empty map when details are present but not a ZodError shape", () => {
    const apiError = new ApiError(
      404,
      { success: false, error: "Not found" },
      "Unable to update",
    );
    expect(fieldErrorsFromApiError(apiError)).toEqual({});
  });
});

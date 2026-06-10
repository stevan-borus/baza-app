/**
 * Error thrown when the API returns 4xx/5xx. Preserves the response body so
 * the UI can render the actual reason (e.g. the "Schedule conflict" payload
 * with the offending session's details) instead of a generic toast.
 *
 * The body shape is endpoint-specific — callers introspect it with type
 * guards (see `isScheduleConflictBody`). The `error` field is the standard
 * `{ error: string }` from `lib/server/http.fail()`, available on every
 * structured failure response in the codebase.
 *
 * Lives in its own react-native-free module so the pure request seam
 * (lib/api-request.ts) and node unit tests can import it without dragging in
 * the platform transport (lib/api.ts → react-native → expo).
 */
export class ApiError extends Error {
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

/**
 * Throw an ApiError if the response is not ok. Tries to parse the JSON body
 * to capture the structured failure; falls back to a generic message if the
 * body is unreadable (network glitch, HTML error page, etc.).
 */
export async function throwIfNotOk(
  response: Response,
  fallbackMessage: string,
): Promise<void> {
  if (response.ok) return;
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Body not JSON — leave it null. ApiError still carries the status code.
  }
  throw new ApiError(response.status, body, fallbackMessage);
}

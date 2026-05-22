// Helpers for turning `ApiError` (from `@/lib/api`) into per-field error maps
// the UI can render next to inputs, instead of dumping the raw JSON blob.
//
// The server returns `{ success: false, error, details }` from `fail()`; when
// `details` is a Zod-shaped object the `issues` array carries `path[]` +
// `message`. We extract those into a flat `{ fieldName: message }` so a form
// can render an inline error under the offending input.

type ZodIssue = {
  path?: unknown;
  message?: unknown;
};

type ZodErrorDetails = {
  name?: unknown;
  issues?: unknown;
  message?: unknown;
};

type ErrorBody = {
  details?: unknown;
};

function getBody(err: unknown): ErrorBody | null {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body: unknown }).body;
    if (body && typeof body === "object") return body as ErrorBody;
  }
  return null;
}

function pathToField(path: unknown): string | null {
  if (!Array.isArray(path) || path.length === 0) return null;
  const head = path[0];
  return typeof head === "string" ? head : null;
}

function issuesToFieldErrors(issues: unknown): Record<string, string> {
  if (!Array.isArray(issues)) return {};
  const out: Record<string, string> = {};
  for (const issue of issues as ZodIssue[]) {
    const field = pathToField(issue?.path);
    if (!field) continue;
    if (typeof issue?.message !== "string") continue;
    if (out[field]) continue; // first-issue-wins per field
    out[field] = issue.message;
  }
  return out;
}

export function fieldErrorsFromApiError(err: unknown): Record<string, string> {
  const body = getBody(err);
  if (!body) return {};
  const details = body.details as ZodErrorDetails | undefined;
  if (!details || typeof details !== "object") return {};
  if (details.name !== "ZodError") return {};

  if (Array.isArray(details.issues)) {
    return issuesToFieldErrors(details.issues);
  }

  // Older Zod (v3) sometimes serializes issues into `message` as a JSON string.
  if (typeof details.message === "string") {
    try {
      const parsed = JSON.parse(details.message);
      return issuesToFieldErrors(parsed);
    } catch {
      return {};
    }
  }

  return {};
}

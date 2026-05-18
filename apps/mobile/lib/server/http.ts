export function ok<T extends Record<string, unknown>>(
  payload: T,
  status = 200,
) {
  return Response.json(payload, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  // Mirror error responses to stderr so devs see them in `pnpm dev`.
  // Stack traces from real exceptions still print via Expo's runtime; this
  // surfaces explicit `fail()` returns (auth/validation/forbidden/etc.).
  if (typeof process !== "undefined" && process?.stderr?.write) {
    const detailStr =
      details === undefined
        ? ""
        : ` :: ${typeof details === "string" ? details : safeStringify(details)}`;
    process.stderr.write(`[api:fail] ${status} ${message}${detailStr}\n`);
  }
  return Response.json(
    {
      success: false,
      error: message,
      details,
    },
    { status },
  );
}

/**
 * Reads a dynamic route param from `ctx`, falling back to a positional lookup
 * in the URL pathname. Expo Router sometimes hands handlers an undefined
 * `ctx.params` for nested dynamic segments depending on dispatch path;
 * without a fallback the handler crashes with
 * "Cannot read properties of undefined (reading 'id')".
 *
 * Pass the segment name that appears RIGHT AFTER the dynamic param in the
 * URL — e.g. for `/api/admin/clients/[id]/consent-records`, pass
 * `"consent-records"` and the helper returns the previous path segment.
 * For trailing dynamic params (no segment after), pass undefined and the
 * helper returns the last segment.
 */
export function paramFromCtxOrUrl(
  request: Request,
  ctx: { params?: Record<string, string | undefined> } | undefined,
  paramName: string,
  afterSegment?: string,
): string | undefined {
  const fromCtx = ctx?.params?.[paramName];
  if (fromCtx) return fromCtx;
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  if (afterSegment === undefined) return parts[parts.length - 1];
  const idx = parts.indexOf(afterSegment);
  return idx > 0 ? parts[idx - 1] : undefined;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

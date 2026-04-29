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

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

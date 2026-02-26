export function ok<T extends Record<string, unknown>>(
  payload: T,
  status = 200,
) {
  return Response.json(payload, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return Response.json(
    {
      success: false,
      error: message,
      details,
    },
    { status },
  );
}

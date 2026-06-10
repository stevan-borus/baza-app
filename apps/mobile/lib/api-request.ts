/**
 * The typed fetch seam — one module that owns the whole "call our API" path:
 *
 *   1. URL building with the ADR-0003 idiom baked in once (RN's
 *      URLSearchParams polyfill returns `undefined` for `.size`, so we read
 *      the serialized string and check its truthiness — never `.size`).
 *   2. Transport via `apiFetch` (native cookie injection / web credentials).
 *   3. Error shaping: 4xx/5xx throw `ApiError` carrying status + parsed body.
 *   4. Optional response validation: pass a Zod schema and the parsed wire
 *      payload is returned; omit it and you get the raw JSON as `unknown`.
 *
 * Lives next to (not inside) lib/api.ts so the pure parts stay importable in
 * node tests and so existing `vi.mock("@/lib/api")` characterization tests
 * keep intercepting the transport underneath this seam.
 */
import type { z } from "zod";
import { apiFetch } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { sharedEnv } from "@/lib/env.shared";

export type ApiQueryParamValue =
  | string
  | number
  | boolean
  | readonly string[]
  | null
  | undefined;
export type ApiQueryParams = Record<string, ApiQueryParamValue>;

/**
 * Append query params to an endpoint, ADR-0003 style.
 */
export function buildApiUrl(endpoint: string, params?: ApiQueryParams): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    const serialized = Array.isArray(value) ? value.join(",") : value;
    if (serialized) searchParams.set(key, String(serialized));
  }
  const qs = searchParams.toString();
  return qs ? `${endpoint}?${qs}` : endpoint;
}

export type ApiRequestOptions<T> = {
  /** Query params; a param is included only when its value is truthy. */
  params?: ApiQueryParams;
  /** Wire schema; when given the JSON body is `.parse()`d before returning. */
  schema?: z.ZodType<T>;
  /** Fallback error message; status is appended as ` (404)` when the body carries no `error` field. */
  errorMessage: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON payload — stringified with a `content-type: application/json` header. */
  body?: unknown;
};

/**
 * Call an API endpoint (path relative to EXPO_PUBLIC_API_URL) and return the
 * validated response payload. Throws `ApiError` on 4xx/5xx.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions<T>,
): Promise<T> {
  const url = buildApiUrl(`${sharedEnv.EXPO_PUBLIC_API_URL}${path}`, options.params);
  const init: RequestInit = { credentials: "include" };
  if (options.method) init.method = options.method;
  if (options.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  const response = await apiFetch(url, init);
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Body not JSON — leave it null. ApiError still carries the status.
    }
    throw new ApiError(
      response.status,
      body,
      `${options.errorMessage} (${response.status})`,
    );
  }
  const json: unknown = await response.json();
  return options.schema ? options.schema.parse(json) : (json as T);
}

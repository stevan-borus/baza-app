/** Cron route protection via shared token header. */
import { env } from "@/lib/server/env";
import { fail } from "@/lib/server/http";

/**
 * Protects internal cron routes with a shared token header.
 */
export function requireCronAuth(request: Request) {
  const token = request.headers.get("x-cron-token");
  if (token !== env.API_ADMIN_BOOTSTRAP_TOKEN) {
    return { ok: false as const, response: fail("Unauthorized", 401) };
  }
  return { ok: true as const };
}

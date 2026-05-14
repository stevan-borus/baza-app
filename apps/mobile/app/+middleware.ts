import type { MiddlewareFunction } from "expo-router/server";
import { startCronScheduler } from "@/lib/server/cron-scheduler";
import { consentGateEnabled } from "@/lib/server/env.server";
import { getConsentStatus } from "@/lib/legal/consent-status";
import { getRequestUser } from "@/lib/server/auth-guards";

// Division of labour:
//   • /api/[...path] — server enforces the gate here (defense in depth for
//     direct API access from stale clients that bypassed the UI redirect).
//   • /(client)/[...path] etc. — these patterns do NOT match real client-tab
//     URLs because expo-router strips route-group names from the URL. The
//     client-side ConsentGateRedirect component (mounted in each role-group
//     _layout) closes that gap without depending on matcher semantics.
export const unstable_settings = {
  matcher: {
    patterns: [
      "/api/[...path]",
      "/(client)/[...path]",
      "/(trainer)/[...path]",
      "/(admin)/[...path]",
    ],
  },
};

startCronScheduler();

const ALLOWED_WITHOUT_CONSENT = [
  "/consent",
  "/sign-in",
  "/accept-invite",
  "/reset-password",
];

const ALLOWED_API_PREFIXES = [
  "/api/auth/",
  "/api/consent/",
  "/api/legal/",
];

const middleware: MiddlewareFunction = async (request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search ? url.search : "";
  process.stderr.write(`[api] ${request.method} ${pathname}${search}\n`);

  if (!consentGateEnabled) return;

  if (
    ALLOWED_WITHOUT_CONSENT.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  ) {
    return;
  }
  if (
    pathname.startsWith("/api/") &&
    ALLOWED_API_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return;
  }
  if (pathname.startsWith("/legal/")) return;

  const user = await getRequestUser(request as unknown as Request);
  if (!user) return;

  try {
    const status = await getConsentStatus(user.id);
    if (status.pending.length > 0) {
      if (pathname.startsWith("/api/")) {
        return new Response(
          JSON.stringify({ error: "Consent required", pending: status.pending }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      return Response.redirect(new URL("/consent", request.url), 307);
    }
  } catch (err) {
    process.stderr.write(
      `[middleware] consent-gate error for ${user.id}: ${String(err)}\n`,
    );
  }
};

export default middleware;

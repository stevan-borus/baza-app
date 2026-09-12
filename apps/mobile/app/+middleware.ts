import type { MiddlewareFunction } from "expo-router/server";
import { consentGateEnabled, rateLimitEnabled } from "@/lib/server/env.server";
import { getConsentStatus } from "@/lib/legal/consent-status";
import { getRequestUser } from "@/lib/server/auth-guards";
import { apiRateLimiter, clientIp, throttleResponse } from "@/lib/server/rate-limit";
import { publicLegalPageResponse } from "@/lib/legal/public-page-response";

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
      "/legal/[key]",
      "/(client)/[...path]",
      "/(trainer)/[...path]",
      "/(admin)/[...path]",
    ],
  },
};

/** `/legal/privacy.html` -> `privacy`; the suffix-less path stays the in-app screen. */
const LEGAL_PAGE_PATH = /^\/legal\/([a-z_]+)\.html$/;

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
  // /consent renders the intake form inline alongside the legal-doc gate;
  // calling POST /api/health-intake before all required docs are accepted
  // is part of that flow, so the gate must let it through.
  "/api/health-intake",
];

const middleware: MiddlewareFunction = async (request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search ? url.search : "";
  process.stderr.write(`[api] ${request.method} ${pathname}${search}\n`);

  // The throttle sits here because the middleware is the only chokepoint every
  // API path shares: it runs before both the better-auth catch-all and our
  // dispatcher, so no route can be reached around it. /api/health is exempt —
  // the Fly proxy probes it every 15s from its own address, and a machine that
  // 429s its own health check drops out of rotation.
  if (
    rateLimitEnabled &&
    pathname.startsWith("/api/") &&
    pathname !== "/api/health"
  ) {
    const ip = clientIp(request as unknown as Request);
    const { allowed, retryAfterSeconds } = apiRateLimiter.check(ip);
    if (!allowed) {
      process.stderr.write(`[throttle] 429 ip=${ip} path=${pathname}\n`);
      return throttleResponse(retryAfterSeconds);
    }
  }

  // Store listings link here. It must render for an anonymous, JS-less client,
  // so it answers above the consent gate and before any auth lookup.
  const legalPage = pathname.match(LEGAL_PAGE_PATH);
  if (legalPage) {
    const response = publicLegalPageResponse(
      legalPage[1],
      url.searchParams.get("locale"),
    );
    if (response) return response;
  }

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

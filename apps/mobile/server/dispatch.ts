// Dispatcher behind the single API catch-all (app/api/[...rest]+api.ts).
//
// It reproduces the slice of expo-server's request handling that we took over by
// collapsing 76 per-route bundles into one: match the request pathname to a
// registered handler module, extract bracket-segment params, invoke the module's
// method export, and reproduce expo-server's 404/405 responses byte-for-byte for
// the misses. See lib/server/route-matcher.ts for the matching rules and the
// parity notes referencing node_modules/expo-server/build/cjs/vendor/abstract.js.

import type { HttpMethod } from "@/lib/server/route-module";
import { matchRoute, toRoutePattern } from "@/lib/server/route-matcher";
import { routesRegistry } from "@/server/routes-registry";

// Precompute the pattern list once per bundle load (module scope). Keys come
// from the generated registry, so this is exactly the set of moved routes.
const patterns = Object.keys(routesRegistry).map(toRoutePattern);

/**
 * Whether a pathname resolves to one of OUR registered handlers.
 *
 * Needed by the better-auth catch-all (app/api/auth/[...all]/+api.ts): expo-router
 * orders `/api/auth/[...all]` BEFORE `/api/[...rest]`, so EVERY `/api/auth/*`
 * request lands on the better-auth handler first — including our own moved auth
 * app-routes (`/api/auth/me`, `/api/auth/sign-in`, `/api/auth/sign-out`,
 * `/api/auth/complete-invite`, `/api/auth/reset-password`,
 * `/api/auth/request-password-reset`). Before consolidation those were specific
 * routes that beat `[...all]`; now the auth catch-all must hand them back to us
 * and only fall through to better-auth for the paths better-auth actually owns
 * (`/api/auth/get-session`, `/api/auth/sign-in/email`, ...).
 */
export function isRegisteredRoute(pathname: string): boolean {
  return matchRoute(pathname, patterns) !== null;
}

/**
 * expo-server's 404 for an unmatched request:
 *   new Response('Not found', { status: 404, headers: {'Content-Type':'text/plain'} })
 * (vendor/abstract.js — the final fall-through `createResponse(... 'Not found' ...)`).
 */
function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * expo-server's 405 when a route matches but the method isn't exported:
 *   createResponse('notAllowedApi', route, 'Method not allowed',
 *     { status: 405, headers: {'Content-Type':'text/plain'} })
 * (vendor/abstract.js -> respondAPI).
 */
function methodNotAllowed(): Response {
  return new Response("Method not allowed", {
    status: 405,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * Route one API request to its handler.
 *
 * Defensive on `/api/auth/*`: expo-router routes those to the better-auth
 * catch-all (app/api/auth/[...all]/+api.ts) before ever reaching us, so if such
 * a path arrives here it's an unregistered auth sub-path — we 404 (never throw)
 * rather than misroute it.
 */
export async function dispatch(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const matched = matchRoute(pathname, patterns);
  if (!matched) return notFound();

  const mod = routesRegistry[matched.key];
  const method = request.method as HttpMethod;
  const handler = mod[method];
  if (typeof handler !== "function") return methodNotAllowed();

  return handler(request, matched.params);
}

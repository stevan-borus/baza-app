import {
  isPublicLegalKey,
  renderLegalPage,
  resolveLocale,
} from "@/lib/legal/public-page";

/**
 * The HTTP shape of a public legal page, shared by the two entry points that
 * serve it: server/routes/legal/pages/[key].ts (/api/legal/pages/<key>) and
 * app/+middleware.ts (the short /legal/<key>.html store-listing URL).
 *
 * Returns null when the key is not a published document, so each caller can
 * pick its own miss behaviour — the route 404s, the middleware falls through
 * to expo-router.
 */
export function publicLegalPageResponse(
  key: string | undefined,
  localeParam: string | null,
): Response | null {
  if (!isPublicLegalKey(key)) return null;

  const page = renderLegalPage(key, resolveLocale(localeParam));
  if (!page) return null;

  return new Response(page, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

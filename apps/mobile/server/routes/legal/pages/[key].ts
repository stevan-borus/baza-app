import { publicLegalPageResponse } from "@/lib/legal/public-page-response";

/**
 * Public, JS-free HTML rendering of a legal document — the URL the app-store
 * listings point at. Served at /api/legal/pages/<key>, and mirrored on the
 * short /legal/<key>.html path by app/+middleware.ts.
 *
 * Unlike the sibling JSON route this returns text/html and never 400s on a bad
 * locale: a store reviewer following a link with a stray query param must get
 * the policy, not an error.
 */
export async function GET(
  request: Request,
  params?: { key?: string },
): Promise<Response> {
  const url = new URL(request.url);
  const rawKey = params?.key ?? url.pathname.split("/").filter(Boolean).pop();

  return (
    publicLegalPageResponse(rawKey, url.searchParams.get("locale")) ??
    new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    })
  );
}

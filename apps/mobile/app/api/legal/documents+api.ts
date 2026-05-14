import { ok } from "@/lib/server/http";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import type { ConsentDocumentKey, AppLocale } from "@/generated/prisma";

const LOCALES: AppLocale[] = ["sr", "en"];

/**
 * Public endpoint — lists every active document version per locale. The
 * unauthenticated /legal/[key] viewer uses this to know what's current.
 * No auth required; the documents themselves are public-facing.
 */
export async function GET(_request: Request) {
  const documents: { key: ConsentDocumentKey; version: number; locale: AppLocale }[] = [];
  const keys = Object.keys(ACTIVE_VERSIONS) as ConsentDocumentKey[];
  for (const key of keys) {
    for (const locale of LOCALES) {
      documents.push({ key, version: ACTIVE_VERSIONS[key], locale });
    }
  }
  return ok({ success: true, documents });
}

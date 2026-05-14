import { z } from "zod";
import { fail, ok } from "@/lib/server/http";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { LEGAL_DOCUMENT_BUNDLE } from "@/lib/legal/generated";
import type { ConsentDocumentKey, AppLocale } from "@/generated/prisma";

const keySchema = z.enum(["tos", "privacy", "eula", "waiver_adult", "waiver_minor"]);
const localeSchema = z.enum(["sr", "en"]);

export async function GET(
  request: Request,
  ctx: { params: { key: string } },
) {
  const parsedKey = keySchema.safeParse(ctx.params.key);
  if (!parsedKey.success) return fail("Unknown document", 404);

  const url = new URL(request.url);
  const parsedLocale = localeSchema.safeParse(url.searchParams.get("locale"));
  if (!parsedLocale.success) return fail("Missing or invalid locale", 400);

  const key: ConsentDocumentKey = parsedKey.data;
  const locale: AppLocale = parsedLocale.data;
  const version = ACTIVE_VERSIONS[key];
  const body = LEGAL_DOCUMENT_BUNDLE[key]?.[version]?.[locale];

  if (!body) return fail("Document not bundled", 500);
  return ok({ success: true, key, version, locale, body });
}

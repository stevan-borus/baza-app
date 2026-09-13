// Renders a bundled legal document as a standalone HTML page.
//
// Why this exists: app-store listings must point at a privacy-policy URL that a
// plain HTTP client can read. The in-app /legal/[key] screen fetches its body
// with useQuery, so the server HTML it returns carries no policy text at all —
// Play reviewers have historically rejected exactly that. The bodies are
// already bundled server-side (LEGAL_DOCUMENT_BUNDLE), so this only has to
// render them.
//
// Only the two documents the store listings link to are published. The waivers
// and the health intake are in-app consent artefacts and stay unreachable here.

import { LEGAL_DOCUMENT_BUNDLE } from "@/lib/legal/generated";
import { markdownToHtml } from "@/lib/legal/markdown-to-html";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import type { AppLocale } from "@/generated/prisma";

export const PUBLIC_LEGAL_KEYS = ["privacy", "tos"] as const;
export type PublicLegalKey = (typeof PUBLIC_LEGAL_KEYS)[number];

export const DEFAULT_LOCALE: AppLocale = "sr";

export function isPublicLegalKey(value: unknown): value is PublicLegalKey {
  return (PUBLIC_LEGAL_KEYS as readonly unknown[]).includes(value);
}

/** Serbian is the default; anything unrecognised falls back to it rather than 400ing. */
export function resolveLocale(raw: string | null): AppLocale {
  return raw === "en" ? "en" : DEFAULT_LOCALE;
}

// Inline so the page has no external assets to fetch — a reviewer's plain HTTP
// client renders it from the single response.
const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 24px 20px 64px;
    max-width: 44rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #16181d;
    background: #ffffff;
    overflow-wrap: break-word;
  }
  h1 { font-size: 1.75rem; line-height: 1.25; margin: 0 0 1rem; }
  h2 { font-size: 1.25rem; line-height: 1.3; margin: 2rem 0 0.5rem; }
  h3 { font-size: 1.05rem; margin: 1.5rem 0 0.5rem; }
  p { margin: 0 0 0.85rem; }
  ul { margin: 0 0 0.85rem; padding-left: 1.25rem; }
  li { margin-bottom: 0.35rem; }
  blockquote {
    margin: 1rem 0;
    padding: 0.5rem 0 0.5rem 0.9rem;
    border-left: 3px solid #9aa2b1;
    color: #414652;
  }
  blockquote p { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
  th, td { border: 1px solid #d4d8e0; padding: 0.5rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f2f4f8; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6e8ee; background: #14161b; }
    blockquote { border-left-color: #6b7383; color: #b6bbc6; }
    th, td { border-color: #333844; }
    th { background: #1d212a; }
  }
`;

/** First `# Heading` of the document, used as the <title>. */
function documentTitle(markdown: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : "BAZA";
}

/**
 * The rendered page, or null when the document is not bundled for this
 * key/version/locale — the caller turns that into a 404.
 */
export function renderLegalPage(
  key: PublicLegalKey,
  locale: AppLocale,
): string | null {
  const version = ACTIVE_VERSIONS[key];
  const markdown = LEGAL_DOCUMENT_BUNDLE[key]?.[version]?.[locale];
  if (!markdown) return null;

  const title = documentTitle(markdown);
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — BAZA</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${markdownToHtml(markdown)}
</main>
</body>
</html>
`;
}

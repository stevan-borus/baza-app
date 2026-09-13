import { describe, it, expect } from "vitest";
import { GET } from "@/server/routes/legal/pages/[key]";

// The store-listing regression this guards: /legal/privacy used to return 200
// with 23KB of HTML that contained zero policy text — the body was fetched
// client-side by useQuery. A status-only assertion passes against that bug, so
// every case here asserts the CONTENT a JS-less reviewer would actually read.
function request(path: string): Request {
  return new Request(`https://t.local/api/legal/pages/${path}`);
}

async function html(path: string): Promise<{ res: Response; text: string }> {
  const res = await GET(request(path));
  return { res, text: await res.text() };
}

describe("GET /api/legal/pages/:key", () => {
  it("serves the Serbian privacy policy body without a locale param", async () => {
    const { res, text } = await html("privacy");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(text).toContain("Pravila o privatnosti");
    expect(text).toContain("Opšta uredba o zaštiti podataka");
    expect(text).toContain("bazapilates@gmail.com");
  });

  it("serves the English privacy policy under ?locale=en", async () => {
    const { res, text } = await html("privacy?locale=en");

    expect(res.status).toBe(200);
    expect(text).toContain("Privacy Policy");
    expect(text).toContain("General Data Protection Regulation");
    expect(text).toContain("GDPR");
  });

  it("serves the terms of use in both locales", async () => {
    const sr = await html("tos");
    expect(sr.res.status).toBe(200);
    expect(sr.text).toContain("Uslovi korišćenja");

    const en = await html("tos?locale=en");
    expect(en.res.status).toBe(200);
    expect(en.text).toContain("Terms of Use");
  });

  it("renders a complete standalone document with lang and title", async () => {
    const { text } = await html("privacy");

    expect(text.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(text).toContain('<html lang="sr">');
    expect(text).toContain("<title>Pravila o privatnosti");
    expect(text.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("needs no JavaScript and no external assets to render", async () => {
    const { text } = await html("privacy");

    expect(text).not.toMatch(/<script/i);
    expect(text).toContain("<style>");
    expect(text).not.toMatch(/<link[^>]+rel="stylesheet"/i);
    expect(text).not.toMatch(/<img\b/i);
  });

  it("converts the markdown the documents actually use", async () => {
    const { text } = await html("privacy?locale=en");

    // Headings, bold runs, bullets and the retention table all appear in
    // docs/legal/en/privacy-v1.md; none may leak raw markdown syntax.
    expect(text).toContain("<h1>Privacy Policy</h1>");
    expect(text).toMatch(/<h2>1\. About the Privacy Policy<\/h2>/);
    expect(text).toContain("<strong>Version:</strong>");
    expect(text).toContain("<li>");
    expect(text).toContain("<table>");
    expect(text).toContain("<blockquote>");
    expect(text).not.toContain("**");
    expect(text).not.toMatch(/^\| /m);
  });

  it("escapes HTML-significant characters from the source markdown", async () => {
    const { text } = await html("privacy?locale=en");

    // The markdown contains no tags; nothing beyond our own chrome may appear.
    expect(text).not.toContain("<script>alert");
    expect(text).toContain("&quot;GDPR&quot;");
  });

  it("falls back to Serbian for an unrecognised locale", async () => {
    const { res, text } = await html("privacy?locale=de");

    expect(res.status).toBe(200);
    expect(text).toContain('<html lang="sr">');
    expect(text).toContain("Pravila o privatnosti");
  });

  it("404s for an unknown document key", async () => {
    const { res, text } = await html("not_a_doc");

    expect(res.status).toBe(404);
    expect(text).not.toContain("Pravila o privatnosti");
  });

  it("404s for a key that exists in the enum but is not publicly published", async () => {
    // Waivers and the health intake are consent artefacts shown in-app, not
    // store-listing pages; publishing them at a guessable URL is not intended.
    const { res } = await html("health_intake");
    expect(res.status).toBe(404);
  });
});

describe("the short /legal/:key.html store-listing URL", () => {
  it("is served by the middleware for an anonymous request", async () => {
    const { default: middleware } = await import("@/app/+middleware");
    const res = await middleware(
      new Request("https://t.local/legal/privacy.html") as never,
    );

    expect(res).toBeInstanceOf(Response);
    const text = await (res as Response).text();
    expect((res as Response).status).toBe(200);
    expect((res as Response).headers.get("content-type")).toMatch(/^text\/html/);
    expect(text).toContain("Pravila o privatnosti");
    expect(text).toContain("Opšta uredba o zaštiti podataka");
  });

  it("honours ?locale=en", async () => {
    const { default: middleware } = await import("@/app/+middleware");
    const res = (await middleware(
      new Request("https://t.local/legal/tos.html?locale=en") as never,
    )) as Response;

    expect(await res.text()).toContain("Terms of Use");
  });

  it("leaves the in-app /legal/:key screen alone", async () => {
    const { default: middleware } = await import("@/app/+middleware");
    const res = await middleware(
      new Request("https://t.local/legal/privacy") as never,
    );

    // No Response means the request falls through to the Expo Router screen,
    // which sign-in, accept-invite and reset-password all link to.
    expect(res).toBeUndefined();
  });
});

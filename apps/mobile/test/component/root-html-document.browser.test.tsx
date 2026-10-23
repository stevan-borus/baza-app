// Expo Router 58 renders every web page through app/+html.tsx and hands it the
// pieces it used to inject itself: <html>/<body> attributes, the metadata and
// stylesheet nodes for <head>, and the hydration scripts for <body>. A root
// document that drops them serves a page that never becomes interactive.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServerDocument } from "expo-router/build/server/ServerDocument";
import Root from "@/app/+html";

function renderDocument() {
  return renderToStaticMarkup(
    <ServerDocument
      data={{
        htmlAttributes: { lang: "sr", dir: "ltr" },
        bodyAttributes: { className: "route-body" },
        headNodes: (
          <>
            <title>Baza Pilates</title>
            <link rel="stylesheet" href="/_expo/static/css/app.css" />
          </>
        ),
        bodyNodes: <script src="/_expo/static/js/web/entry.js" defer />,
      }}
    >
      <Root>
        <div id="app-root">app</div>
      </Root>
    </ServerDocument>,
  );
}

describe("root HTML document", () => {
  it("puts the route's metadata and stylesheets in <head>", () => {
    const head = /<head>(.*)<\/head>/s.exec(renderDocument())?.[1] ?? "";

    expect(head).toContain("<title>Baza Pilates</title>");
    expect(head).toContain('href="/_expo/static/css/app.css"');
  });

  it("loads the hydration script after the server-rendered app", () => {
    const html = renderDocument();
    const appAt = html.indexOf('id="app-root"');
    const scriptAt = html.indexOf('src="/_expo/static/js/web/entry.js"');

    expect(appAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeGreaterThan(appAt);
    expect(html.indexOf("</body>")).toBeGreaterThan(scriptAt);
  });

  it("applies the route's <html> and <body> attributes", () => {
    const html = renderDocument();

    expect(html).toMatch(/<html[^>]*\blang="sr"/);
    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
    expect(html).toMatch(/<body[^>]*\bclass="route-body"/);
  });

  it("keeps the app-shell viewport that blocks zoom", () => {
    expect(renderDocument()).toContain(
      'content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"',
    );
  });
});

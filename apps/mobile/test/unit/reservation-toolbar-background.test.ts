/**
 * The "Rezervacije" selection footer must paint a SOLID background.
 *
 * The bug: the bar shipped `bg-bg/95`, but the theme has never defined a
 * `--color-bg` token — only `--color-background`. Tailwind generates utilities
 * from the `--color-*` declarations in global.css, so `bg-bg/95` matched
 * nothing and emitted no rule. The bar painted fully transparent, which is why
 * the user saw cards straight through it and read the whole footer as part of
 * the scroller.
 *
 * Nothing downstream catches this. A misspelt Tailwind color is not a type
 * error, not a lint error, and in the component layer react-native-web strips
 * `className` before it reaches the DOM, so a computed-style assertion reads
 * transparent whether the class is right or wrong. The only place the mistake
 * is visible is where it was made: the class string in the source, checked
 * against the tokens the theme really declares.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "../..");

const globalCss = readFileSync(path.join(APP_DIR, "global.css"), "utf8");
const source = readFileSync(
  path.join(APP_DIR, "components/admin/reservation-mode.tsx"),
  "utf8",
);

/** Every `--color-<name>` the theme declares, across both variants. */
const themeColorTokens = new Set(
  [...globalCss.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]),
);

/** The className string on the pinned selection toolbar. */
function toolbarClasses(): string[] {
  const match = source.match(/className="(absolute bottom-0[^"]*)"/);
  if (!match) throw new Error("pinned selection toolbar className not found");
  return match[1].split(/\s+/);
}

describe("selection toolbar background", () => {
  it("names a background token the theme actually defines", () => {
    const backgroundClass = toolbarClasses().find((c) => c.startsWith("bg-"));
    expect(backgroundClass, "toolbar must declare a background").toBeDefined();

    const token = backgroundClass!.replace(/^bg-/, "").replace(/\/\d+$/, "");
    expect(
      themeColorTokens.has(token),
      `bg-${token} resolves to nothing — the theme declares no --color-${token}`,
    ).toBe(true);
  });

  it("is fully opaque, not an opacity variant scrolled content shows through", () => {
    const backgroundClass = toolbarClasses().find((c) => c.startsWith("bg-"))!;
    expect(backgroundClass).not.toMatch(/\/\d+$/);
  });

  it("keeps the hairline separating it from the scrolled content", () => {
    expect(toolbarClasses()).toContain("border-t");
  });
});

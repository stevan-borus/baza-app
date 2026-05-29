/**
 * Admin tab-bar ordering test.
 *
 * Phase 2 (`fix/katalog-tab`) promotes Katalog to a real tab and places it in
 * the second slot, between Pregled and Klijenti. This test asserts the order
 * by parsing `app/(admin)/_layout.tsx` and reading the sequence of
 * `<Tabs.Screen name="...">` declarations. Order in source == order in
 * navigator == order in the FloatingTabBar.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminLayoutPath = resolve(__dirname, "../../app/(admin)/_layout.tsx");

function tabsScreenNames(source: string): string[] {
  // Matches: <Tabs.Screen name="foo" ...> (any whitespace, attrs follow).
  const matches = [...source.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)];
  return matches.map((m) => m[1]);
}

describe("admin tab order", () => {
  const source = readFileSync(adminLayoutPath, "utf8");
  const names = tabsScreenNames(source);

  it("declares exactly six tabs", () => {
    expect(names).toHaveLength(6);
  });

  it("puts Katalog second and Beleške last", () => {
    // Beleške is the admin's notes feed (write parity with trainers). It sits
    // last as the newest, experimental tab — the bottom bar is now tight at
    // six, which is intentional and under evaluation.
    expect(names).toEqual([
      "pregled",
      "katalog",
      "klijenti",
      "naplata",
      "izvestaji",
      "beleske",
    ]);
  });

  it("no longer declares katalog with href:null (it's a real tab now)", () => {
    expect(source).not.toMatch(/name="katalog"\s+options=\{\{\s*href:\s*null/);
  });
});

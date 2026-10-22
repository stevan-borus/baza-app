// Reanimated before 4.3.3 evicts a settled animation's final props on Android
// when the app pauses, so screens wrapped in Moti entrance fades come back at
// opacity 0. Expo SDK 56 pins 4.3.1; the fix is upstream PR
// https://github.com/software-mansion/react-native-reanimated/pull/9527.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { version } = require("react-native-reanimated/package.json") as {
  version: string;
};

const SEMVER =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(v: string): { core: number[]; prerelease?: string } {
  const match = SEMVER.exec(v);
  if (!match) throw new Error(`unparseable version "${v}"`);
  return { core: match.slice(1, 4).map(Number), prerelease: match[4] };
}

// Build metadata is ignored. A prerelease sorts before its own release, so
// 4.3.3-rc.0 is older than 4.3.3, but 4.4.0-nightly is still newer.
function isAtLeast(actual: string, minimum: string): boolean {
  const a = parseVersion(actual);
  const m = parseVersion(minimum);
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== m.core[i]) return a.core[i] > m.core[i];
  }
  return a.prerelease === undefined;
}

describe("isAtLeast", () => {
  it.each([
    ["4.3.4", true],
    ["4.3.3", true],
    ["4.3.2", false],
    ["4.3.3-rc.0", false],
    ["4.3.3+build.1", true],
    ["4.4.0-nightly-20261021-63aa14096", true],
    ["5.0.0", true],
    ["4.2.9", false],
  ])("%s >= 4.3.3 is %s", (actual, expected) => {
    expect(isAtLeast(actual, "4.3.3")).toBe(expected);
  });
});

describe("react-native-reanimated version", () => {
  it("includes the settled-props eviction fix (>= 4.3.3)", () => {
    expect(
      isAtLeast(version, "4.3.3"),
      `installed react-native-reanimated ${version} is older than 4.3.3`,
    ).toBe(true);
  });
});

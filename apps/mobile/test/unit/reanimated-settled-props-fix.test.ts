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

function parseVersion(v: string): number[] {
  return v.split("-")[0].split(".").map(Number);
}

function isAtLeast(actual: string, minimum: string): boolean {
  const a = parseVersion(actual);
  const m = parseVersion(minimum);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== m[i]) return a[i] > m[i];
  }
  return true;
}

describe("react-native-reanimated version", () => {
  it("includes the settled-props eviction fix (>= 4.3.3)", () => {
    expect(
      isAtLeast(version, "4.3.3"),
      `installed react-native-reanimated ${version} is older than 4.3.3`,
    ).toBe(true);
  });
});

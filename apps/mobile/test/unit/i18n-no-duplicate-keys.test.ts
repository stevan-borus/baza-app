import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LOCALES_DIR = path.resolve(__dirname, "../../locales");

function findDuplicateKeyPaths(jsonText: string): string[] {
  const duplicates: string[] = [];
  const stack: { keys: Set<string>; pathParts: string[] }[] = [
    { keys: new Set(), pathParts: [] },
  ];
  let i = 0;
  let inString = false;
  let escape = false;
  let currentKey: string | null = null;
  let buffer = "";
  let expectingKey = true;

  while (i < jsonText.length) {
    const ch = jsonText[i];

    if (inString) {
      if (escape) {
        buffer += ch;
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
        if (expectingKey) {
          currentKey = buffer;
        }
        buffer = "";
      } else {
        buffer += ch;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      i++;
      continue;
    }

    if (ch === ":") {
      if (currentKey !== null) {
        const frame = stack[stack.length - 1];
        if (frame.keys.has(currentKey)) {
          duplicates.push([...frame.pathParts, currentKey].join("."));
        } else {
          frame.keys.add(currentKey);
        }
      }
      expectingKey = false;
      i++;
      continue;
    }

    if (ch === "{") {
      stack.push({
        keys: new Set(),
        pathParts: currentKey
          ? [...stack[stack.length - 1].pathParts, currentKey]
          : [...stack[stack.length - 1].pathParts],
      });
      currentKey = null;
      expectingKey = true;
      i++;
      continue;
    }

    if (ch === "}") {
      stack.pop();
      currentKey = null;
      expectingKey = true;
      i++;
      continue;
    }

    if (ch === ",") {
      currentKey = null;
      expectingKey = true;
      i++;
      continue;
    }

    i++;
  }

  return duplicates;
}

describe("locale files have no duplicate keys", () => {
  for (const file of ["en.json", "sr.json"]) {
    it(`${file} has no duplicate keys at any depth`, () => {
      const text = readFileSync(path.join(LOCALES_DIR, file), "utf8");
      expect(findDuplicateKeyPaths(text)).toEqual([]);
    });
  }
});

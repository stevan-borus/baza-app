import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import sr from "@/locales/sr.json";

// CLDR plural-form suffixes appended by i18next pluralization. Languages have
// different plural-rule sets (en: one/other, sr: one/few/other), so suffix
// divergence is expected and not a missing translation.
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

function stripPluralSuffix(key: string): string {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) return key.slice(0, -suffix.length);
  }
  return key;
}

function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      keys.push(...flattenKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe("i18n key parity", () => {
  it("en.json and sr.json cover the same translatable concepts (plural suffixes normalized)", () => {
    const enKeys = new Set(flattenKeys(en).map(stripPluralSuffix));
    const srKeys = new Set(flattenKeys(sr).map(stripPluralSuffix));
    const onlyInEn = [...enKeys].filter((k) => !srKeys.has(k)).sort();
    const onlyInSr = [...srKeys].filter((k) => !enKeys.has(k)).sort();
    expect({ onlyInEn, onlyInSr }).toEqual({ onlyInEn: [], onlyInSr: [] });
  });
});

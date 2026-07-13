/**
 * Validation/parsing for the optional package-type price text input.
 *
 * The field is free text on web (keyboardType="numeric" doesn't restrict
 * hardware keyboards), and `parseInt("abc") → NaN` used to be silently
 * dropped by JSON.stringify — the form "saved" with no price. Digits-only
 * keeps parseInt exact and rejects negatives, fractions, and exponents.
 */
export function isPriceInputValid(raw: string): boolean {
  const value = raw.trim();
  if (value === "") return true; // price is optional
  return /^\d+$/.test(value);
}

/** Maps a VALID input to its wire value: null for empty, whole dinars otherwise. */
export function parsePriceInput(raw: string): number | null {
  const value = raw.trim();
  if (value === "") return null;
  return parseInt(value, 10);
}

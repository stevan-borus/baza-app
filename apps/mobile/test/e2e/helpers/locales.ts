/**
 * Locale-aware text helpers — load JSON for the current default locale (sr)
 * and English (for the EN smoke suite). Tests reference keys like
 * `t.auth.signIn` so they survive copy edits but break on key removal —
 * exactly the trade-off the test plan asked for (selector strategy section).
 */
import en from "../../../locales/en.json";
import sr from "../../../locales/sr.json";

export const t = sr;
export const t_en = en;

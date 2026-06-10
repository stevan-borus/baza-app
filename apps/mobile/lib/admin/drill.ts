/**
 * Cross-tab drill contract — ADR-0005. This module owns BOTH sides.
 *
 * Origin side: a screen that drills into another tab (e.g. an Izveštaji
 * sub-page tapping a chart bar) builds the push with `drillHref` —
 * destination path + filter params + encoded `returnTo` — instead of
 * hand-assembling params. Drills are `router.push` to the OTHER tab's route
 * (ADR-0001 per-tab stacks force this).
 *
 * Destination side: the screen parses the same params back through the
 * helpers below, so origin and destination share ONE definition of the
 * param contract and can't drift apart silently. `useReturnToPill` feeds
 * the "← Nazad u {label}" pill that `router.replace`s back to the origin
 * (replace, not push, so history doesn't pile up on repeated drills);
 * `useDrillWindow` feeds the destination's pre-filter, falling back to the
 * screen's own default window when absent or malformed.
 */
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

/** An ISO-stringed [from, to) date window carried by a drill. */
export type DrillWindow = { from: string; to: string };

/**
 * Encode a path so it can be safely embedded in a `?returnTo=...` query
 * param. Internal — origins go through `drillHref`.
 */
function encodeReturnTo(path: string): string {
  return encodeURIComponent(path);
}

/**
 * The drills that exist today. Add a member here when wiring a new
 * cross-tab destination — the union keeps every origin's param shape in
 * one place.
 */
export type Drill =
  | {
      to: "naplata";
      /** Decoded origin path the destination's return pill replaces back to. */
      returnTo: string;
      /** Optional billing window the destination pre-filters to. */
      window?: DrillWindow;
    }
  | {
      to: "klijent";
      returnTo: string;
      clientUserId: string;
    }
  | {
      to: "session";
      returnTo: string;
      sessionId: string;
    };

/**
 * Build the `router.push` href for a drill. Pure — unit-tested directly.
 *
 * The return type is left to inference so each branch keeps the concrete
 * param shape Expo Router's typed routes require (the `[id]` routes need a
 * literal `id` key — a widened `Record<string, string>` annotation erases it
 * and `router.push` rejects the result).
 */
export function drillHref(drill: Drill) {
  const returnTo = encodeReturnTo(drill.returnTo);
  if (drill.to === "klijent") {
    return {
      pathname: "/(admin)/klijenti/[id]" as const,
      params: { id: drill.clientUserId, returnTo },
    };
  }
  if (drill.to === "session") {
    return {
      pathname: "/(admin)/pregled/sessions/[id]" as const,
      params: { id: drill.sessionId, returnTo },
    };
  }
  return {
    pathname: "/(admin)/naplata" as const,
    params: drill.window
      ? { returnTo, from: drill.window.from, to: drill.window.to }
      : { returnTo },
  };
}

/**
 * Parse the `from`/`to` drill params a destination received. Returns the
 * window only when BOTH endpoints are single, valid, correctly-ordered date
 * strings — anything less means "no drill window", so the destination falls
 * back to its own default (Naplata: its selected month). Values are passed
 * through untouched; the origin already sends API-ready ISO strings.
 * Pure counterpart of `useDrillWindow`.
 */
export function parseDrillWindow(params: {
  from?: string | string[];
  to?: string | string[];
  // Destinations hand over their whole search-params object — other drill
  // params (returnTo, route ids, …) ride along and are ignored here.
  [extra: string]: unknown;
}): DrillWindow | null {
  const { from, to } = params;
  if (typeof from !== "string" || typeof to !== "string") return null;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
  if (fromMs >= toMs) return null;
  return { from, to };
}

/**
 * Map a (decoded) path to the i18n key of the tab label used inside the
 * return pill. Returns null when the path doesn't match a known tab —
 * callers treat that as "no pill to show". Add a prefix here when wiring a
 * new origin tab.
 */
function labelKeyForPath(path: string): string | null {
  // Strip query string before matching — only the route shape matters.
  const base = path.split("?")[0];
  if (base.startsWith("/(admin)/izvestaji")) return "admin.izvestaji.labels.izvestaji";
  if (base.startsWith("/(admin)/naplata")) return "admin.izvestaji.labels.naplata";
  return null;
}

/**
 * Parse a raw `returnTo` search param back into the decoded origin path and
 * the pill's localized label key. Returns null for missing, malformed, or
 * unrecognized values — the destination renders no pill in that case.
 * Pure counterpart of `useReturnToPill`.
 */
export function parseReturnTo(
  raw: unknown,
): { path: string; labelKey: string } | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const labelKey = labelKeyForPath(path);
  if (!labelKey) return null;
  return { path, labelKey };
}

/**
 * Read the `returnTo` search param off the current route and, if present
 * and recognizable, return the decoded path + a localized label. Otherwise
 * null. Destination screens render the pill only when this returns non-null
 * (see components/admin/return-to-pill.tsx).
 */
export function useReturnToPill(): { path: string; label: string } | null {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const parsed = parseReturnTo(params.returnTo);
  if (!parsed) return null;
  return { path: parsed.path, label: t(parsed.labelKey) };
}

/**
 * Read the `from`/`to` drill params off the current route. Null when the
 * route wasn't reached via a windowed drill — the caller falls back to its
 * own selected window.
 */
export function useDrillWindow(): DrillWindow | null {
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  return parseDrillWindow(params);
}

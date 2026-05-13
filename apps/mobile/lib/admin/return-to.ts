/**
 * Cross-tab drill helper — ADR-0005.
 *
 * Source screens (e.g. an Izveštaji sub-page tapping a chart bar) push a
 * destination route in another tab with a `returnTo` query param. The
 * destination screen renders a "← Nazad u {label}" pill at the top and,
 * when tapped, `router.replace`s back to the encoded path. Replace (not push)
 * keeps history from piling up on repeated drills.
 *
 * The pill label is derived from the path so a single helper can serve every
 * source. Add a new path prefix below when wiring a new origin tab.
 */
import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

/**
 * Encode a path so it can be safely embedded in a `?returnTo=...` query
 * param. Source screens call this when constructing the push params.
 */
export function encodeReturnTo(path: string): string {
  return encodeURIComponent(path);
}

/**
 * Map a (decoded) path to a localized tab label used inside the back pill.
 * Returns null when the path doesn't match a known tab — callers should
 * treat that as "no pill to show".
 */
function labelForPath(path: string, t: (key: string) => string): string | null {
  // Strip query string before matching — only the route shape matters.
  const base = path.split("?")[0];
  if (base.startsWith("/(admin)/izvestaji")) return t("admin.izvestaji.labels.izvestaji");
  if (base.startsWith("/(admin)/naplata")) return t("admin.izvestaji.labels.naplata");
  return null;
}

/**
 * Read the `returnTo` search param off the current route and, if present and
 * recognizable, return the decoded path + a localized label. Otherwise null.
 *
 * Destination screens render the pill only when this returns non-null:
 *
 *   const back = useReturnToPill();
 *   {back ? <Pressable onPress={() => router.replace(back.path)}>...</Pressable> : null}
 */
export function useReturnToPill(): { path: string; label: string } | null {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  return useMemo(() => {
    const raw = params.returnTo;
    if (typeof raw !== "string" || raw.length === 0) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return null;
    }
    const label = labelForPath(decoded, t);
    if (!label) return null;
    return { path: decoded, label };
  }, [params.returnTo, t]);
}

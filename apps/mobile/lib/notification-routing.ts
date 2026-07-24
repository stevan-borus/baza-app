/**
 * Resolves an in-app or push notification to a route href.
 *
 * Pure function — no router, no React, no network. The caller supplies the
 * lookup data (`giftPackageTypes` for the birthday-gift PackageType match) so
 * this can be unit-tested without mocking anything.
 *
 * Returns `null` when the notification has no useful destination — the caller
 * should still mark it read on tap, but not navigate.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type NotificationRoutingInput = {
  type: string;
  payload: Record<string, Json> | null | undefined;
  /**
   * The catalog of birthday-gift PackageTypes available right now — supplied
   * by the caller from the packageTypes query cache. With one gift SKU per
   * class type retired, a single gift SKU now serves every class type via the
   * assign-sheet picker: we preselect the lone SKU when there is exactly one,
   * and only fall back to a covered-class-type match as a tiebreak when a
   * studio still runs several gift SKUs.
   */
  giftPackageTypes: Array<{ id: string; classTypeIds: string[] }>;
};

type Payload = Record<string, Json>;

function getString(p: Payload | null | undefined, k: string): string | null {
  if (!p) return null;
  const v = p[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function resolveNotificationHref(input: NotificationRoutingInput): string | null {
  const { type, payload, giftPackageTypes } = input;

  switch (type) {
    case "BIRTHDAY_ADMIN_PROMPT": {
      const clientProfileId = getString(payload, "clientProfileId");
      if (!clientProfileId) return null;
      const suggestedClassTypeId = getString(payload, "suggestedClassTypeId");
      // One gift SKU → always preselect it. Several → keep the covered-match as
      // a tiebreak (first match wins, else the first gift SKU). None → no
      // preselection. The class-type hint rides through regardless so the
      // assign-sheet picker can prefill it.
      const gift =
        giftPackageTypes.length === 1
          ? giftPackageTypes[0]
          : giftPackageTypes.length > 1
            ? (suggestedClassTypeId
                ? giftPackageTypes.find((pt) =>
                    pt.classTypeIds.includes(suggestedClassTypeId),
                  )
                : undefined) ?? giftPackageTypes[0]
            : undefined;
      const params = new URLSearchParams({
        openAssignPackage: clientProfileId,
        mode: "comp",
      });
      if (gift) params.set("initialPackageTypeId", gift.id);
      if (suggestedClassTypeId)
        params.set("initialClassTypeId", suggestedClassTypeId);
      return `/(admin)/klijenti?${params.toString()}`;
    }

    case "BOOKING_CANCELED_ADMIN": {
      const sessionId = getString(payload, "sessionId");
      if (!sessionId) return null;
      return `/(admin)/pregled/sessions/${sessionId}`;
    }

    case "MINOR_PAPER_NEEDED": {
      const clientUserId = getString(payload, "clientUserId");
      if (!clientUserId) return null;
      return `/(admin)/klijenti/${clientUserId}`;
    }

    // A package was assigned or paid for. The destination is the client's own
    // packages view — always available, so no payload is required to route.
    case "PACKAGE_ASSIGNED":
      return "/(client)/profile/packages";

    default:
      return null;
  }
}

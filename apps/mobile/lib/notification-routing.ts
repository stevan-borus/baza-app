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
   * by the caller from the packageTypes query cache. We pick the one whose
   * covered `classTypeIds` include the notification's `suggestedClassTypeId`.
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
      const gift = suggestedClassTypeId
        ? giftPackageTypes.find((pt) =>
            pt.classTypeIds.includes(suggestedClassTypeId),
          )
        : undefined;
      const params = new URLSearchParams({
        openAssignPackage: clientProfileId,
        mode: "comp",
      });
      if (gift) params.set("initialPackageTypeId", gift.id);
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

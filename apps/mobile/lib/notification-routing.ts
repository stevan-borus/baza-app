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
   * by the caller from the packageTypes query cache. The built-in system gift
   * is preselected deterministically (`isSystem` wins); any legacy admin-
   * created gift SKUs keep the single/tiebreak fallback so an older studio
   * still routes sensibly until it deletes them.
   */
  giftPackageTypes: Array<{ id: string; classTypeIds: string[]; isSystem?: boolean }>;
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
      // Routed by USER id, not clientProfile id: the klijenti screen resolves
      // the deep-link target through `clientsQueries.byId`, which keys on
      // userId. A clientProfile id can only be resolved by scanning the
      // paginated list, which misses anyone past the first page.
      //
      // The clientProfileId fallback is NOT dead code: NotificationLog rows
      // written before the cron started emitting `clientUserId` carry only the
      // profile id, and dropping it would make every already-delivered
      // birthday prompt untappable. Those rows still hit the pagination bug
      // for a page-2 client — no worse than before — and age out on their own.
      // Delete this fallback only once no such rows remain.
      const target =
        getString(payload, "clientUserId") ??
        getString(payload, "clientProfileId");
      if (!target) return null;
      const suggestedClassTypeId = getString(payload, "suggestedClassTypeId");
      // Built-in system gift always wins — it's the one row admins are meant to
      // use. Otherwise fall back to the legacy rule: one gift SKU → preselect
      // it; several → covered-match tiebreak (first match, else first gift SKU);
      // none → no preselection. The class-type hint rides through regardless so
      // the assign-sheet picker can prefill it.
      const systemGift = giftPackageTypes.find((pt) => pt.isSystem);
      const gift =
        systemGift ??
        (giftPackageTypes.length === 1
          ? giftPackageTypes[0]
          : giftPackageTypes.length > 1
            ? (suggestedClassTypeId
                ? giftPackageTypes.find((pt) =>
                    pt.classTypeIds.includes(suggestedClassTypeId),
                  )
                : undefined) ?? giftPackageTypes[0]
            : undefined);
      const params = new URLSearchParams({
        openAssignPackage: target,
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

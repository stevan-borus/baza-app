import { router, type Href } from "expo-router";
import { resolveNotificationHref } from "@/lib/notification-routing";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

type TapInput = {
  type: string;
  payload: Record<string, Json> | null | undefined;
};

/**
 * Hook that returns a single `handleTap` function for routing a notification
 * (in-app inbox row or OS-level push tap) to the right destination.
 *
 * Reads the gift PackageType catalog from React Query — the same cache the
 * AssignPackage sheet uses — so the lookup is free when the user has already
 * been in the admin app a moment ago.
 */
export function useNotificationTapHandler() {
  // Gifts are now given from a REAL, priced package (isGift on the assignment)
  // rather than a dedicated 🎂 SKU, and the assign sheet no longer lists those
  // retired SKUs. Preselecting one would hand the sheet a package id that is
  // not in its own list: the submit would look enabled while the admin could
  // neither see nor change what they were about to grant. So a birthday tap
  // preselects nothing and simply opens the sheet in gift mode — the class-type
  // hint still rides along to mark the assignment as a gift.
  const giftPackageTypes: Array<{
    id: string;
    classTypeIds: string[];
    isSystem?: boolean;
  }> = [];

  function handleTap(input: TapInput): boolean {
    const href = resolveNotificationHref({
      type: input.type,
      payload: input.payload,
      giftPackageTypes,
    });
    if (!href) return false;
    router.push(href as Href);
    return true;
  }

  return handleTap;
}

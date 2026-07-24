import { router, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
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
  const packageTypesQuery = useQuery(packagesQueries.types());
  const giftPackageTypes = (packageTypesQuery.data?.packageTypes ?? [])
    .filter((pt) => pt.isBirthdayGift)
    .map((pt) => ({
      id: pt.id,
      classTypeIds: pt.classTypes.map((classType) => classType.id),
      isSystem: pt.isSystem ?? false,
    }));

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

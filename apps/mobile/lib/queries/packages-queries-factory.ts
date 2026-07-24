import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  packageTypeMutationResponseSchema,
  packageTypesResponseSchema,
  type PackageType,
  type PackageTypeMutationResponse,
  type PackageTypesResponse,
} from "@baza/types/catalog";
import { clientPackagesResponseSchema } from "@baza/types/packages";
import { apiRequest } from "@/lib/api-request";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";

export type { PackageType } from "@baza/types/catalog";
export type { ClientPackage } from "@baza/types/packages";

const packagesAll = ["packages"] as const;

export const packagesQueries = {
  all: packagesAll,

  types: () =>
    queryOptions({
      queryKey: [...packagesAll, "types"] as const,
      queryFn: () =>
        apiRequest("/api/packages/types", {
          schema: packageTypesResponseSchema,
          errorMessage: "Unable to load package types",
        }),
      staleTime: 60_000,
    }),

  clientPackages: (clientProfileId?: string) =>
    queryOptions({
      queryKey: [...packagesAll, "client-packages", clientProfileId ?? "me"] as const,
      queryFn: () =>
        apiRequest("/api/packages/client-packages", {
          params: { clientProfileId },
          schema: clientPackagesResponseSchema,
          errorMessage: "Unable to load packages",
        }),
      staleTime: 30_000,
    }),

  /**
   * Cursor-paginated admin list of every ClientPackage in the studio with
   * optional server-side substring search (matches client fullName or email).
   *
   * Mirrors the clients-list infinite-query shape: page param is the opaque
   * nextCursor returned by the API (the last clientPackage.id on the page);
   * `null` means "first page". The consumer wires onScroll + fetchNextPage
   * and uses useDeferredValue to batch search keystrokes.
   */
  clientPackagesAdminList: (params?: { search?: string; take?: number }) =>
    infiniteQueryOptions({
      queryKey: [
        ...packagesAll,
        "client-packages",
        "admin",
        { search: params?.search ?? "", take: params?.take ?? 20 },
      ] as const,
      queryFn: ({ pageParam }) =>
        apiRequest("/api/packages/client-packages", {
          params: {
            cursor: pageParam,
            search: params?.search,
            take: params?.take ?? 20,
          },
          schema: clientPackagesResponseSchema,
          errorMessage: "Unable to load assignments",
        }),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor ?? null,
      staleTime: 30_000,
    }),

  createType: () =>
    mutationOptions({
      mutationKey: [...packagesAll, "types", "create"] as const,
      mutationFn: async (payload: {
        name: string;
        sessionCount: number;
        validityDays: number;
        lateCancelHours?: number;
        price?: number | null;
        classTypeIds: string[];
        isBirthdayGift?: boolean;
      }) =>
        apiRequest("/api/packages/types", {
          method: "POST",
          body: payload,
          schema: packageTypeMutationResponseSchema,
          errorMessage: "Unable to create package type",
        }),
    }),

  updateType: () =>
    mutationOptions({
      mutationKey: [...packagesAll, "types", "update"] as const,
      mutationFn: async ({
        id,
        ...payload
      }: {
        id: string;
        name?: string;
        sessionCount?: number;
        validityDays?: number;
        lateCancelHours?: number;
        price?: number | null;
        classTypeIds?: string[];
        isBirthdayGift?: boolean;
      }) =>
        apiRequest(`/api/packages/types/${id}`, {
          method: "PATCH",
          body: payload,
          schema: packageTypeMutationResponseSchema,
          errorMessage: "Unable to update package type",
        }),
    }),

  deleteType: () =>
    mutationOptions({
      mutationKey: [...packagesAll, "types", "delete"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/packages/types/${id}`, {
          method: "DELETE",
          errorMessage: "Unable to delete package type",
        }),
    }),

  createClientPackage: () =>
    mutationOptions({
      mutationKey: [...packagesAll, "client-packages", "create"] as const,
      mutationFn: async (payload: {
        clientProfileId: string;
        packageTypeId: string;
        startsAt: string;
      }) =>
        apiRequest("/api/packages/client-packages", {
          method: "POST",
          body: payload,
          errorMessage: "Unable to create package",
        }),
    }),

  revokeClientPackage: () =>
    mutationOptions({
      mutationKey: [...packagesAll, "client-packages", "revoke"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/packages/client-packages/${id}/revoke`, {
          method: "POST",
          errorMessage: "Unable to revoke package",
        }),
    }),

  addSessionToClientPackage: () =>
    mutationOptions({
      mutationKey: [...packagesAll, "client-packages", "add-session"] as const,
      mutationFn: (id: string) =>
        apiRequest(`/api/packages/client-packages/${id}/add-session`, {
          method: "POST",
          errorMessage: "Unable to add a session",
        }),
    }),

  pause: () =>
    mutationOptions({
      mutationKey: [...packagesAll, "pause"] as const,
      mutationFn: async (payload: {
        clientProfileId: string;
        startsAt: string;
        endsAt: string;
        reason?: string;
      }) =>
        apiRequest("/api/packages/pause", {
          method: "POST",
          body: payload,
          errorMessage: "Unable to pause package",
        }),
    }),
};

// ── Mutation hooks ──────────────────────────────────────────────────────────
// createType/updateType return the full PackageType (incl. isBirthdayGift after
// the Layer 4 server widening), so splice the returned row into the types list
// cache instead of invalidating. Append on create, replace-by-id on update.

type PackageTypesListData = PackageTypesResponse;
const packageTypesListKey = packagesQueries.types().queryKey;

function splicePackageType(queryClient: QueryClient, packageType: PackageType) {
  queryClient.setQueryData<PackageTypesListData>(packageTypesListKey, (prev) => {
    if (!prev) return prev;
    const exists = prev.packageTypes.some((p) => p.id === packageType.id);
    const packageTypes = exists
      ? prev.packageTypes.map((p) => (p.id === packageType.id ? packageType : p))
      : [...prev.packageTypes, packageType];
    return { ...prev, packageTypes };
  });
}

export function createPackageTypeMutationOptions(queryClient: QueryClient) {
  return {
    ...packagesQueries.createType(),
    onSuccess: (data: PackageTypeMutationResponse) =>
      splicePackageType(queryClient, data.packageType),
  };
}

export function updatePackageTypeMutationOptions(queryClient: QueryClient) {
  return {
    ...packagesQueries.updateType(),
    onSuccess: (data: PackageTypeMutationResponse) =>
      splicePackageType(queryClient, data.packageType),
  };
}

// A new ClientPackage changes the client's derived packageStatus (list chip +
// detail-header pill live under ["clients"]) and the package report figures —
// both render on always-mounted screens, so they must be refetched here.
export function assignClientPackageMutationOptions(queryClient: QueryClient) {
  return {
    ...packagesQueries.createClientPackage(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: packagesQueries.all }),
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
        queryClient.invalidateQueries({ queryKey: reportsQueries.all }),
      ]);
    },
  };
}

// A PackagePause row isn't part of any ["packages"] response — its visible
// effect is the derived packageStatus ("paused") under ["clients"], on the
// list chip and the detail-header pill.
export function pausePackageMutationOptions(queryClient: QueryClient) {
  return {
    ...packagesQueries.pause(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: packagesQueries.all }),
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
      ]);
    },
  };
}

// Revoking is the widest-reaching admin write in the app: ONE transaction
// revokes the package, cancels every FUTURE booking it backed, deletes the
// client's waitlist entries (firing promotions for other clients on the
// freed seats), and voids the linked PENDING billing record. So it must
// invalidate the SUPERSET of every derived surface those effects feed —
// under-invalidating is exactly what left stale bookedCount / spots, client
// bookings lists and the client-facing package timeline on live devices:
//
//   ["packages"]        → admin package history/rows, active-assignments list,
//                         client packageStatus source, packages report detail
//   ["clients"]         → clients-list badge + detail-header packageStatus pill
//   ["reports"]         → revenue + package report figures (izveštaji)
//   ["billing"]         → Naplata list row → "Stornirano", /billing/summary
//   ["bookings"]        → client bookings lists + home "upcoming" hero (future
//                         bookings were canceled) + any promoted client's list
//   ["sessions"]        → availability bookedCount/spots + session-detail
//                         attendee lists (a seat freed, a waitlister promoted)
//   ["client-packages"] → the client-facing /clients/me/packages timeline
//                         (the revoked package must drop off it)
//
// bookings / sessions / client-packages are invalidated via key literals (not
// their factory `.all`) to avoid a factory-to-factory import cycle:
// bookings-queries-factory already imports THIS module, so importing it back
// here would be circular — same reason ["billing"] was already a literal.
export function revokeClientPackageMutationOptions(queryClient: QueryClient) {
  return {
    ...packagesQueries.revokeClientPackage(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: packagesQueries.all }),
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
        queryClient.invalidateQueries({ queryKey: reportsQueries.all }),
        queryClient.invalidateQueries({ queryKey: ["billing"] }),
        queryClient.invalidateQueries({ queryKey: ["bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["client-packages"] }),
      ]);
    },
  };
}

// "+1 termin" bumps sessionsRemaining on one package, which changes the admin
// package rows (["packages"]) and the client's derived packageStatus — the
// same "left to book" / active-package figures the assign path already
// refreshes under ["clients"] — plus the packages-report counts (["reports"]).
// It never touches bookings/billing/sessions, so those stay out.
export function addSessionToClientPackageMutationOptions(queryClient: QueryClient) {
  return {
    ...packagesQueries.addSessionToClientPackage(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: packagesQueries.all }),
        queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
        queryClient.invalidateQueries({ queryKey: reportsQueries.all }),
      ]);
    },
  };
}

export function useAssignClientPackageMutation() {
  return useMutation(assignClientPackageMutationOptions(useQueryClient()));
}

export function useAddSessionToClientPackageMutation() {
  return useMutation(addSessionToClientPackageMutationOptions(useQueryClient()));
}

export function useRevokeClientPackageMutation() {
  return useMutation(revokeClientPackageMutationOptions(useQueryClient()));
}

export function usePausePackageMutation() {
  return useMutation(pausePackageMutationOptions(useQueryClient()));
}

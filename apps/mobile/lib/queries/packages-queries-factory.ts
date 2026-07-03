import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/api-request";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";

const embeddedClassTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const packageTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sessionCount: z.number(),
  validityDays: z.number(),
  lateCancelHours: z.number(),
  classTypeId: z.string(),
  classType: embeddedClassTypeSchema.optional(),
  isBirthdayGift: z.boolean().optional(),
});

const packageTypesResponseSchema = z.object({
  success: z.boolean(),
  packageTypes: z.array(packageTypeSchema),
});

const packageTypeMutationResponseSchema = z.object({
  success: z.boolean(),
  packageType: packageTypeSchema,
});

const embeddedPackageTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  sessionCount: z.number(),
  validityDays: z.number(),
  lateCancelHours: z.number().optional(),
});

const embeddedClientSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
});

const embeddedBillingRecordSchema = z.object({
  amount: z.number(),
  method: z.string(),
});

const clientPackageSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  packageTypeId: z.string(),
  classTypeId: z.string().optional(),
  startsAt: z.string(),
  expiresAt: z.string(),
  sessionsRemaining: z.number(),
  packageType: embeddedPackageTypeSchema.optional(),
  client: embeddedClientSchema.optional(),
  // Per-client GET path attaches the matching CONFIRMED BillingRecord (or
  // null for comp/gift packages). Admin list-all path omits this field —
  // it stays optional so both responses validate against the same schema.
  billingRecord: embeddedBillingRecordSchema.nullable().optional(),
});

const clientPackagesResponseSchema = z.object({
  success: z.boolean(),
  packages: z.array(clientPackageSchema),
  // Cursor-based pagination: opaque string (clientPackage.id) of the last
  // row on this page, or null when this is the final page. Optional in the
  // response shape so the non-paginated branches (per-client list) still
  // validate against the same schema.
  nextCursor: z.nullable(z.string()).optional(),
});

export type PackageType = z.infer<typeof packageTypeSchema>;
export type ClientPackage = z.infer<typeof clientPackageSchema>;

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
        classTypeId: string;
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
        classTypeId?: string;
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

type PackageTypesListData = z.infer<typeof packageTypesResponseSchema>;
type PackageTypeMutationResponse = z.infer<typeof packageTypeMutationResponseSchema>;
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

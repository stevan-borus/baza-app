import {
  queryOptions,
  mutationOptions,
  infiniteQueryOptions,
} from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, throwIfNotOk } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

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

export const packagesQueries = {
  types: () =>
    queryOptions({
      queryKey: ["packages", "types"] as const,
      queryFn: async () => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/types`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Unable to load package types (${response.status})`);
        return packageTypesResponseSchema.parse(await response.json());
      },
      staleTime: 60_000,
    }),

  clientPackages: (clientProfileId?: string) =>
    queryOptions({
      queryKey: ["packages", "client-packages", clientProfileId ?? "me"] as const,
      queryFn: async () => {
        const qs = clientProfileId
          ? `?clientProfileId=${encodeURIComponent(clientProfileId)}`
          : "";
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/client-packages${qs}`,
          { credentials: "include" },
        );
        if (!response.ok) throw new Error(`Unable to load packages (${response.status})`);
        return clientPackagesResponseSchema.parse(await response.json());
      },
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
        "packages",
        "client-packages",
        "admin",
        { search: params?.search ?? "", take: params?.take ?? 20 },
      ] as const,
      queryFn: async ({ pageParam }) => {
        const qs = new URLSearchParams();
        if (pageParam) qs.set("cursor", pageParam);
        if (params?.search) qs.set("search", params.search);
        qs.set("take", String(params?.take ?? 20));
        const url = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/client-packages?${qs.toString()}`;
        const response = await apiFetch(url, { credentials: "include" });
        if (!response.ok)
          throw new Error(`Unable to load assignments (${response.status})`);
        return clientPackagesResponseSchema.parse(await response.json());
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor ?? null,
      staleTime: 30_000,
    }),

  createType: () =>
    mutationOptions({
      mutationKey: ["packages", "types", "create"] as const,
      mutationFn: async (payload: {
        name: string;
        sessionCount: number;
        validityDays: number;
        lateCancelHours?: number;
        classTypeId: string;
        isBirthdayGift?: boolean;
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/types`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        await throwIfNotOk(response, "Unable to create package type");
        return response.json();
      },
    }),

  updateType: () =>
    mutationOptions({
      mutationKey: ["packages", "types", "update"] as const,
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
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/types/${id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        await throwIfNotOk(response, "Unable to update package type");
        return response.json();
      },
    }),

  deleteType: () =>
    mutationOptions({
      mutationKey: ["packages", "types", "delete"] as const,
      mutationFn: async (id: string) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/types/${id}`,
          { method: "DELETE", credentials: "include" },
        );
        await throwIfNotOk(response, "Unable to delete package type");
        return response.json();
      },
    }),

  createClientPackage: () =>
    mutationOptions({
      mutationKey: ["packages", "client-packages", "create"] as const,
      mutationFn: async (payload: {
        clientProfileId: string;
        packageTypeId: string;
        startsAt: string;
      }) => {
        const response = await apiFetch(
          `${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/client-packages`,
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) throw new Error(`Unable to create package (${response.status})`);
        return response.json();
      },
    }),

  pause: () =>
    mutationOptions({
      mutationKey: ["packages", "pause"] as const,
      mutationFn: async (payload: {
        clientProfileId: string;
        startsAt: string;
        endsAt: string;
        reason?: string;
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/pause`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to pause package (${response.status})`);
        return response.json();
      },
    }),
};

import { queryOptions, mutationOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const packageTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sessionCount: z.number(),
  validityDays: z.number(),
  lateCancelHours: z.number(),
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

const clientPackageSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  packageTypeId: z.string(),
  startsAt: z.string(),
  expiresAt: z.string(),
  sessionsRemaining: z.number(),
  packageType: embeddedPackageTypeSchema.optional(),
});

const clientPackagesResponseSchema = z.object({
  success: z.boolean(),
  packages: z.array(clientPackageSchema),
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

  createType: () =>
    mutationOptions({
      mutationKey: ["packages", "types", "create"] as const,
      mutationFn: async (payload: {
        name: string;
        sessionCount: number;
        validityDays: number;
        lateCancelHours?: number;
      }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/packages/types`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Unable to create package type (${response.status})`);
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
